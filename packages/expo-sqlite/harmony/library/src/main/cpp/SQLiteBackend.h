struct Connection : Resource, std::enable_shared_from_this<Connection> {
  sqlite3 *db = nullptr;
  std::recursive_mutex mutex;
  std::vector<std::weak_ptr<Statement>> statements;
  std::vector<std::weak_ptr<Session>> sessions;
  std::shared_ptr<EventSink> eventSink;
  bool listen = false;
  ~Connection() override {
    if (db) exsqlite3_close_v2(db);
  }
  std::shared_ptr<Connection> connection() override { return shared_from_this(); }
  void requireOpen() const {
    if (!db) throw NativeError("ERR_ACCESS_CLOSED_RESOURCE", "Access to closed resource");
  }
  void check(int code) const {
    if (code != SQLITE_OK) {
      throw std::runtime_error("Error code " + std::to_string(code) + ": " +
                               (db ? exsqlite3_errmsg(db) : exsqlite3_errstr(code)));
    }
  }
};

struct Statement : Resource {
  std::shared_ptr<Connection> owner;
  exsqlite3_stmt *stmt = nullptr;
  // Successful prepare of empty/comment-only SQL has no SQLite statement.
  // Its lifetime is still distinct from an explicitly finalized resource.
  bool finalized = false;
  explicit Statement(std::shared_ptr<Connection> db) : owner(std::move(db)) {}
  ~Statement() override {
    std::lock_guard<std::recursive_mutex> lock(owner->mutex);
    if (stmt) exsqlite3_finalize(stmt);
  }
  std::shared_ptr<Connection> connection() override { return owner; }
  void requireOpen() const {
    owner->requireOpen();
    if (finalized) throw NativeError("ERR_ACCESS_CLOSED_RESOURCE", "Access to closed resource");
  }
};

struct Session : Resource {
  std::shared_ptr<Connection> owner;
  exsqlite3_session *session = nullptr;
  explicit Session(std::shared_ptr<Connection> db) : owner(std::move(db)) {}
  ~Session() override {
    std::lock_guard<std::recursive_mutex> lock(owner->mutex);
    if (session) exsqlite3session_delete(session);
  }
  std::shared_ptr<Connection> connection() override { return owner; }
  void requireOpen() const {
    owner->requireOpen();
    if (!session) throw NativeError("ERR_ACCESS_CLOSED_RESOURCE", "Access to closed resource");
  }
};

template <typename T> std::shared_ptr<T> resource(const Value &value) {
  auto result = std::dynamic_pointer_cast<T>(value.get<Handle>());
  if (!result) throw std::invalid_argument("Incorrect SQLite native resource");
  result->requireOpen();

  return result;
}

const std::string &cstring(const Value &value) { return value.get<std::string>(); }

int byteCount(size_t size) {
  if (size > static_cast<size_t>(std::numeric_limits<int>::max()))
    throw std::length_error("SQLite value exceeds INT_MAX bytes");

  return static_cast<int>(size);
}

void updateHook(void *context, int action, const char *schema, const char *table, sqlite3_int64 row) noexcept {
  auto *db = static_cast<Connection *>(context);
  if (!db->eventSink || !db->eventSink->listening.load()) return;

  try {
    const char *file = exsqlite3_db_filename(db->db, schema);
    db->eventSink->emit(Value::Record{{"databaseName", std::string(schema)},
                                      {"databaseFilePath", std::string(file ? file : "")},
                                      {"tableName", std::string(table)},
                                      {"rowId", static_cast<double>(row)},
                                      {"typeId", std::string(action == SQLITE_INSERT   ? "insert"
                                                             : action == SQLITE_UPDATE ? "update"
                                                                                       : "delete")}});
  } catch (...) {
    // Notification allocation must not change the result of an already executed write.
  }
}

Value::Array columnValues(exsqlite3_stmt *stmt) {
  Value::Array row;
  const int count = exsqlite3_column_count(stmt);
  row.reserve(count);

  for (int i = 0; i < count; ++i) {
    switch (exsqlite3_column_type(stmt, i)) {
    case SQLITE_INTEGER:
      row.emplace_back(static_cast<double>(exsqlite3_column_int64(stmt, i)));
      break;
    case SQLITE_FLOAT:
      row.emplace_back(exsqlite3_column_double(stmt, i));
      break;
    case SQLITE_TEXT: {
      const auto *text = exsqlite3_column_text(stmt, i);
      if (!text) throw std::bad_alloc();

      row.emplace_back(std::string(reinterpret_cast<const char *>(text), exsqlite3_column_bytes(stmt, i)));
      break;
    }
    case SQLITE_BLOB: {
      const auto *bytes = static_cast<const unsigned char *>(exsqlite3_column_blob(stmt, i));
      const int count = exsqlite3_column_bytes(stmt, i);
      if (!bytes && count) throw std::bad_alloc();

      row.emplace_back(count ? Bytes(bytes, bytes + count) : Bytes{});
      break;
    }
    default:
      row.emplace_back();
      break;
    }
  }

  return row;
}

void bind(Statement &statement, const Value::Record &params, bool array, bool blobs) {
  for (const auto &[key, value] : params) {
    int index = 0;
    if (array) {
      size_t end = 0;
      const auto number = std::stoll(key, &end);
      if (end != key.size() || number < 0 || number >= std::numeric_limits<int>::max()) {
        throw std::invalid_argument("Invalid positional bind parameter index");
      }

      index = static_cast<int>(number) + 1;
    } else {
      index = exsqlite3_bind_parameter_index(statement.stmt, cstring(Value(key)).c_str());
    }
    if (index == 0) continue; // Upstream ignores unknown named parameters.

    int status;
    if (blobs) {
      const auto &bytes = value.get<Bytes>();
      status = bytes.empty() ? exsqlite3_bind_zeroblob(statement.stmt, index, 0)
                             : exsqlite3_bind_blob(statement.stmt, index, bytes.data(), byteCount(bytes.size()),
                                                   SQLITE_TRANSIENT);
    } else if (value.isNull()) {
      status = exsqlite3_bind_null(statement.stmt, index);
    } else if (const auto *boolean = std::get_if<bool>(&value.data)) {
      status = exsqlite3_bind_int(statement.stmt, index, *boolean ? 1 : 0);
    } else if (const auto *number = std::get_if<double>(&value.data)) {
      if (std::isfinite(*number) && std::trunc(*number) == *number) {
        status = exsqlite3_bind_int64(statement.stmt, index, integerValue(*number));
      } else {
        status = exsqlite3_bind_double(statement.stmt, index, *number);
      }
    } else {
      const auto &text = value.get<std::string>();
      status = exsqlite3_bind_text(statement.stmt, index, text.data(), byteCount(text.size()), SQLITE_TRANSIENT);
    }

    // Upstream ignores sqlite3_bind_* errors (including SQLITE_RANGE).
    (void)status;
  }
}

Bytes copySQLiteBuffer(void *data, int size) {
  std::unique_ptr<void, decltype(&exsqlite3_free)> buffer(data, exsqlite3_free);
  if (!size) return {};
  if (!data || size < 0) throw std::runtime_error("Invalid SQLite output buffer");

  auto *bytes = static_cast<unsigned char *>(data);
  return Bytes(bytes, bytes + size);
}

Bytes changeset(Session &session) {
  int size = 0;
  void *data = nullptr;
  const int status = exsqlite3session_changeset(session.session, &size, &data);
  auto bytes = copySQLiteBuffer(data, size);
  session.owner->check(status);

  return bytes;
}

Bytes invert(const Bytes &bytes) {
  int size = 0;
  void *data = nullptr;
  const int status =
      exsqlite3changeset_invert(byteCount(bytes.size()), const_cast<unsigned char *>(bytes.data()), &size, &data);
  auto result = copySQLiteBuffer(data, size);
  if (status != SQLITE_OK) throw std::runtime_error(exsqlite3_errstr(status));

  return result;
}

void close(Connection &db, bool finalize) {
  if (finalize) {
    for (auto &weak : db.statements) {
      if (auto statement = weak.lock()) {
        statement->stmt = nullptr;
        statement->finalized = true;
      }
    }
    // Match upstream: extensions may also prepare statements on this connection.
    while (auto *statement = exsqlite3_next_stmt(db.db, nullptr))
      exsqlite3_finalize(statement);
  }

  // Keep the connection usable when close() fails with SQLITE_BUSY.
  if (exsqlite3_next_stmt(db.db, nullptr)) {
    db.check(SQLITE_BUSY);
  }

  for (auto &weak : db.sessions) {
    if (auto session = weak.lock()) {
      if (session->session) exsqlite3session_delete(session->session);
      session->session = nullptr;
    }
  }

  db.check(exsqlite3_close(db.db));
  db.db = nullptr;
  if (db.eventSink) db.eventSink->stop(napi_tsfn_release);
}

Value execute(Task &task) {
  const auto &args = task.args;
  const auto op = task.spec->op;

  if (op == Op::Dispose) {
    auto db = std::dynamic_pointer_cast<Connection>(args[0].get<Handle>());
    if (!db) throw std::invalid_argument("Expected a database handle");

    if (db->db) close(*db, true);

    return {};
  }

  if (op == Op::Open) {
    auto db = std::make_shared<Connection>();
    const auto &options = args[1].get<Value::Record>();
    db->listen = options.at("enableChangeListener").get<bool>();

    if (exsqlite3_open(args[2].isNull() ? cstring(args[0]).c_str() : ":memory:", &db->db) != SQLITE_OK) {
      throw NativeError("E_SQLITE_OPEN_DATABASE",
                        "Could not open database: " +
                            std::string(db->db ? exsqlite3_errmsg(db->db) : "allocation failed"));
    }

    if (!args[2].isNull()) {
      const auto &bytes = args[2].get<Bytes>();
      auto *buffer = static_cast<unsigned char *>(exsqlite3_malloc64(std::max<size_t>(bytes.size(), 1)));
      if (!buffer) throw std::bad_alloc();

      if (!bytes.empty()) std::memcpy(buffer, bytes.data(), bytes.size());

      // FREEONCLOSE transfers ownership even if deserialize fails (SQLite contract).
      db->check(exsqlite3_deserialize(db->db, "main", buffer, bytes.size(), bytes.size(),
                                      SQLITE_DESERIALIZE_RESIZEABLE | SQLITE_DESERIALIZE_FREEONCLOSE));
    }

    return Handle(db);
  }

  if (op >= Op::Run && op <= Op::Finalize) {
    auto statement = resource<Statement>(args[0]);
    auto &db = *statement->owner;
    if (op != Op::Columns && resource<Connection>(args[1]).get() != &db) {
      throw std::invalid_argument("Statement belongs to a different database");
    }

    // Empty SQL has no statement: step(NULL) fails, but clear_bindings(NULL) can crash.
    if (!statement->stmt && (op == Op::Run || op == Op::Step)) {
      throw std::runtime_error("Error code " + std::to_string(SQLITE_MISUSE) + ": " + exsqlite3_errstr(SQLITE_MISUSE));
    }

    switch (op) {
    case Op::Run: {
      exsqlite3_reset(statement->stmt);
      db.check(exsqlite3_clear_bindings(statement->stmt));
      bind(*statement, args[2].get<Value::Record>(), args[4].get<bool>(), false);
      bind(*statement, args[3].get<Value::Record>(), args[4].get<bool>(), true);

      const int status = exsqlite3_step(statement->stmt);
      if (status != SQLITE_ROW && status != SQLITE_DONE) db.check(status);

      return Value::Record{{"lastInsertRowId", static_cast<double>(exsqlite3_last_insert_rowid(db.db))},
                           {"changes", static_cast<double>(exsqlite3_changes(db.db))},
                           {"firstRowValues", status == SQLITE_ROW ? columnValues(statement->stmt) : Value::Array{}}};
    }
    case Op::Step: {
      const int status = exsqlite3_step(statement->stmt);
      if (status == SQLITE_ROW) return columnValues(statement->stmt);
      if (status != SQLITE_DONE) db.check(status);

      return {};
    }
    case Op::Reset:
      db.check(exsqlite3_reset(statement->stmt));
      return {};
    case Op::Columns: {
      Value::Array names;
      for (int i = 0; i < exsqlite3_column_count(statement->stmt); ++i) {
        const char *name = exsqlite3_column_name(statement->stmt, i);
        if (!name) throw std::bad_alloc();

        names.emplace_back(std::string(name));
      }

      return names;
    }
    case Op::Finalize: {
      const int status = exsqlite3_finalize(statement->stmt);
      statement->stmt = nullptr; // finalize destroys the statement even on failure.
      statement->finalized = true;

      db.check(status);

      return {};
    }
    default:
      break;
    }
  }

  if (op >= Op::Attach) {
    auto session = resource<Session>(args[0]);
    auto &db = *session->owner;
    if (resource<Connection>(args[1]).get() != &db) throw std::invalid_argument("Session belongs to a different database");

    switch (op) {
    case Op::Attach:
      db.check(exsqlite3session_attach(session->session, args[2].isNull() ? nullptr : cstring(args[2]).c_str()));
      return {};
    case Op::Enable:
      exsqlite3session_enable(session->session, args[2].get<bool>());
      return {};
    case Op::CloseSession:
      exsqlite3session_delete(session->session);
      session->session = nullptr;
      return {};
    case Op::Changeset:
      return changeset(*session);
    case Op::InvertedChangeset:
      return invert(changeset(*session));
    case Op::InvertChangeset:
      return invert(args[2].get<Bytes>());
    case Op::ApplyChangeset: {
      const auto &bytes = args[2].get<Bytes>();
      db.check(exsqlite3changeset_apply(
          db.db, byteCount(bytes.size()), const_cast<unsigned char *>(bytes.data()), nullptr,
          [](void *, int, exsqlite3_changeset_iter *) { return SQLITE_CHANGESET_REPLACE; }, nullptr));
      return {};
    }
    default:
      break;
    }
  }

  auto db = resource<Connection>(args[0]);
  switch (op) {
  case Op::SyncLibSQL:
    throw NativeError("ERR_UNSUPPORTED_OPERATION", "libSQL is not enabled in this build");
  case Op::Init:
    if (db->listen) exsqlite3_update_hook(db->db, updateHook, db.get());
    return {};
  case Op::Close:
    close(*db, args[1].get<bool>());
    return {};
  case Op::Exec:
    db->check(exsqlite3_exec(db->db, cstring(args[1]).c_str(), nullptr, nullptr, nullptr));
    return {};
  case Op::InTransaction:
    return exsqlite3_get_autocommit(db->db) == 0;
  case Op::Serialize: {
    sqlite3_int64 size = 0;
    auto *data = exsqlite3_serialize(db->db, cstring(args[1]).c_str(), &size, 0);
    std::unique_ptr<void, decltype(&exsqlite3_free)> buffer(data, exsqlite3_free);

    if (!data) throw std::runtime_error("Unable to serialize database: " + std::string(exsqlite3_errmsg(db->db)));
    if (size < 0 || static_cast<uint64_t>(size) > std::numeric_limits<size_t>::max())
      throw std::length_error("Serialized database is too large");

    return Bytes(data, data + static_cast<size_t>(size));
  }
  case Op::Prepare: {
    auto statement = std::make_shared<Statement>(db);
    db->check(exsqlite3_prepare_v2(db->db, cstring(args[1]).c_str(), -1, &statement->stmt, nullptr));

    db->statements.erase(
        std::remove_if(db->statements.begin(), db->statements.end(), [](const auto &s) { return s.expired(); }),
        db->statements.end());
    db->statements.emplace_back(statement);

    return Handle(statement);
  }
  case Op::CreateSession: {
    auto session = std::make_shared<Session>(db);
    db->check(exsqlite3session_create(db->db, cstring(args[1]).c_str(), &session->session));

    db->sessions.erase(
        std::remove_if(db->sessions.begin(), db->sessions.end(), [](const auto &s) { return s.expired(); }),
        db->sessions.end());
    db->sessions.emplace_back(session);

    return Handle(session);
  }
  case Op::LoadExtension: {
    db->check(exsqlite3_enable_load_extension(db->db, 1));

    char *message = nullptr;
    const char *entry = args[2].isNull() || cstring(args[2]).empty() ? nullptr : cstring(args[2]).c_str();
    const int status = exsqlite3_load_extension(db->db, cstring(args[1]).c_str(), entry, &message);
    std::unique_ptr<void, decltype(&exsqlite3_free)> buffer(message, exsqlite3_free);
    if (status != SQLITE_OK) throw std::runtime_error(message ? message : exsqlite3_errmsg(db->db));

    return {};
  }
  case Op::Backup: {
    auto source = resource<Connection>(args[2]);
    auto *backup = exsqlite3_backup_init(db->db, cstring(args[1]).c_str(), source->db, cstring(args[3]).c_str());
    if (!backup) throw std::runtime_error(exsqlite3_errmsg(db->db));

    const int step = exsqlite3_backup_step(backup, -1);
    const int finish = exsqlite3_backup_finish(backup);
    if (step != SQLITE_DONE) db->check(step);
    db->check(finish);

    return {};
  }
  default:
    throw std::logic_error("Unknown SQLite operation");
  }
}
