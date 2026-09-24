struct LibSQLCall {
  const char *error = nullptr;
  ~LibSQLCall() {
    if (error) libsql_free_string(error);
  }
  void check(int status) const {
    if (status) throw NativeError("ERR_INTERNAL_SQLITE_ERROR", error ? error : "libSQL operation failed");
  }
};

struct Connection : Resource, std::enable_shared_from_this<Connection> {
  libsql_database_t db = nullptr;
  libsql_connection_t conn = nullptr;
  std::recursive_mutex mutex;
  std::vector<std::weak_ptr<Statement>> statements;
  std::shared_ptr<EventSink> eventSink;
  bool listen = false;
  ~Connection() override {
    if (conn) libsql_disconnect(conn);
    if (db) libsql_close(db);
  }
  std::shared_ptr<Connection> connection() override { return shared_from_this(); }
  void requireOpen() const {
    if (!conn) throw NativeError("ERR_ACCESS_CLOSED_RESOURCE", "Access to closed resource");
  }
};

struct Statement : Resource {
  std::shared_ptr<Connection> owner;
  libsql_stmt_t stmt = nullptr;
  libsql_rows_t rows = nullptr;
  explicit Statement(std::shared_ptr<Connection> owner) : owner(std::move(owner)) {}
  ~Statement() override {
    std::lock_guard<std::recursive_mutex> lock(owner->mutex);
    finalize();
  }
  void finalize() {
    if (rows) libsql_free_rows(rows);
    rows = nullptr;
    if (stmt) libsql_free_stmt(stmt);
    stmt = nullptr;
  }
  std::shared_ptr<Connection> connection() override { return owner; }
  void requireOpen() const {
    owner->requireOpen();
    if (!stmt) throw NativeError("ERR_ACCESS_CLOSED_RESOURCE", "Access to closed resource");
  }
  void reset() {
    if (rows) libsql_free_rows(rows);
    rows = nullptr;

    LibSQLCall call;
    call.check(libsql_reset_stmt(stmt, &call.error));
  }
  libsql_rows_t getRows() {
    if (!rows) {
      LibSQLCall call;
      call.check(libsql_query_stmt(stmt, &rows, &call.error));
      if (!rows) throw std::runtime_error("libsql_query_stmt returned null rows");
    }

    return rows;
  }
};

template <typename T> std::shared_ptr<T> resource(const Value &value) {
  auto result = std::dynamic_pointer_cast<T>(value.get<Handle>());
  if (!result) throw std::invalid_argument("Incorrect libSQL resource");
  result->requireOpen();

  return result;
}

void close(Connection &db) {
  for (auto &weak : db.statements)
    if (auto stmt = weak.lock()) stmt->finalize();

  if (db.conn) libsql_disconnect(db.conn);
  db.conn = nullptr;
  if (db.db) libsql_close(db.db);
  db.db = nullptr;
  if (db.eventSink) db.eventSink->stop(napi_tsfn_release);
}

void bind(Statement &statement, const Value::Record &params, bool array, bool blobs) {
  if (!array && !params.empty()) {
    throw NativeError("ERR_UNSUPPORTED_OPERATION", "Named parameter binding is not supported in libSQL mode");
  }

  for (const auto &[key, value] : params) {
    size_t end = 0;
    auto number = std::stoll(key, &end);
    if (end != key.size() || number < 0 || number >= std::numeric_limits<int>::max()) {
      throw NativeError("ERR_INVALID_BIND_PARAMETER", "Invalid bind parameter");
    }

    int index = static_cast<int>(number) + 1;
    LibSQLCall call;
    if (blobs) {
      const auto &bytes = value.get<Bytes>();
      if (bytes.size() > std::numeric_limits<int>::max()) throw std::length_error("BLOB exceeds INT_MAX bytes");

      // Rust slice::from_raw_parts requires non-null even for a zero-length slice.
      const unsigned char empty = 0;
      call.check(
          libsql_bind_blob(statement.stmt, index, bytes.empty() ? &empty : bytes.data(), bytes.size(), &call.error));
    } else if (value.isNull()) call.check(libsql_bind_null(statement.stmt, index, &call.error));
    else if (auto boolean = std::get_if<bool>(&value.data))
      call.check(libsql_bind_int(statement.stmt, index, *boolean, &call.error));
    else if (auto number = std::get_if<double>(&value.data)) {
      if (std::isfinite(*number) && std::trunc(*number) == *number) {
        call.check(libsql_bind_int(statement.stmt, index, integerValue(*number), &call.error));
      } else call.check(libsql_bind_float(statement.stmt, index, *number, &call.error));
    } else call.check(libsql_bind_string(statement.stmt, index, value.get<std::string>().c_str(), &call.error));
  }
}

Value step(Statement &statement) {
  auto rows = statement.getRows();
  libsql_row_t raw = nullptr;
  LibSQLCall call;
  call.check(libsql_next_row(rows, &raw, &call.error));
  std::unique_ptr<const libsql_row, decltype(&libsql_free_row)> row(raw, libsql_free_row);
  if (!raw) return {};

  Value::Array result;
  for (int i = 0; i < libsql_column_count(rows); ++i) {
    int type;
    LibSQLCall field;
    field.check(libsql_column_type(rows, raw, i, &type, &field.error));
    switch (type) {
    case LIBSQL_INT: {
      long long number;
      field.check(libsql_get_int(raw, i, &number, &field.error));
      result.emplace_back(static_cast<double>(number));
      break;
    }
    case LIBSQL_FLOAT: {
      double number;
      field.check(libsql_get_float(raw, i, &number, &field.error));
      result.emplace_back(number);
      break;
    }
    case LIBSQL_TEXT: {
      const char *value = nullptr;
      field.check(libsql_get_string(raw, i, &value, &field.error));
      std::unique_ptr<const char, decltype(&libsql_free_string)> text(value, libsql_free_string);

      result.emplace_back(std::string(value ? value : ""));
      break;
    }
    case LIBSQL_BLOB: {
      blob value{};
      field.check(libsql_get_blob(raw, i, &value, &field.error));
      struct BlobOwner {
        blob data;
        ~BlobOwner() { libsql_free_blob(data); }
      } buffer{value};
      if (value.len < 0 || (!value.ptr && value.len)) throw std::runtime_error("Invalid libSQL BLOB");

      auto bytes = reinterpret_cast<const unsigned char *>(value.ptr);
      result.emplace_back(value.len ? Bytes(bytes, bytes + value.len) : Bytes{});
      break;
    }
    case LIBSQL_NULL:
      result.emplace_back();
      break;
    default:
      throw NativeError("ERR_INVALID_CONVERTIBLE", "Unsupported libSQL column type");
    }
  }

  return result;
}

Value execute(Task &task) {
  const auto &args = task.args;
  const auto op = task.spec->op;

  if (op == Op::Dispose) {
    auto db = std::dynamic_pointer_cast<Connection>(args[0].get<Handle>());
    if (!db) throw std::invalid_argument("Expected database");

    close(*db);

    return {};
  }

  if (op == Op::Open) {
    if (!args[2].isNull()) throw NativeError("ERR_UNSUPPORTED_OPERATION", "Unsupported operation in libSQL mode");

    const auto &options = args[1].get<Value::Record>();
    const auto &url = options.at("libSQLUrl"), &token = options.at("libSQLAuthToken");
    if (url.isNull() || token.isNull())
      throw NativeError("ERR_INVALID_ARGUMENTS", "libSQLUrl and libSQLAuthToken must be provided");

    auto db = std::make_shared<Connection>();
    db->listen = options.at("enableChangeListener").get<bool>();
    LibSQLCall call;
    if (options.at("libSQLRemoteOnly").get<bool>()) {
      call.check(libsql_open_remote_with_webpki(url.get<std::string>().c_str(), token.get<std::string>().c_str(),
                                                &db->db, &call.error));
    } else {
      libsql_config config{};
      config.db_path = args[0].get<std::string>().c_str();
      config.primary_url = url.get<std::string>().c_str();
      config.auth_token = token.get<std::string>().c_str();
      config.read_your_writes = 1;
      config.with_webpki = 1;
      config.offline = 1;
      call.check(libsql_open_sync_with_config(config, &db->db, &call.error));
    }

    call.check(libsql_connect(db->db, &db->conn, &call.error));

    return Handle(db);
  }

  if (op >= Op::Run && op <= Op::Finalize) {
    auto stmt = resource<Statement>(args[0]);
    auto db = stmt->owner;
    if (op != Op::Columns && resource<Connection>(args[1]) != db)
      throw std::invalid_argument("Statement belongs to a different database");

    switch (op) {
    case Op::Run: {
      stmt->reset();
      bind(*stmt, args[2].get<Value::Record>(), args[4].get<bool>(), false);
      bind(*stmt, args[3].get<Value::Record>(), args[4].get<bool>(), true);

      auto row = step(*stmt);

      return Value::Record{{"lastInsertRowId", static_cast<double>(libsql_last_insert_rowid(db->conn))},
                           {"changes", static_cast<double>(libsql_changes(db->conn))},
                           {"firstRowValues", row.isNull() ? Value(Value::Array{}) : std::move(row)}};
    }
    case Op::Step:
      return step(*stmt);
    case Op::Reset:
      stmt->reset();
      return {};
    case Op::Finalize:
      stmt->finalize();
      return {};
    case Op::Columns: {
      auto rows = stmt->getRows();
      Value::Array names;
      for (int i = 0; i < libsql_column_count(rows); ++i) {
        const char *name = nullptr;
        LibSQLCall call;
        call.check(libsql_column_name(rows, i, &name, &call.error));
        std::unique_ptr<const char, decltype(&libsql_free_string)> text(name, libsql_free_string);
        names.emplace_back(std::string(name ? name : ""));
      }

      return names;
    }
    default:
      break;
    }
  }

  if (op >= Op::Attach) throw NativeError("ERR_UNSUPPORTED_OPERATION", "Unsupported operation in libSQL mode");

  auto db = resource<Connection>(args[0]);
  LibSQLCall call;
  switch (op) {
  case Op::Init:
    if (db->listen) throw NativeError("ERR_UNSUPPORTED_OPERATION", "Unsupported operation in libSQL mode");
    return {};
  case Op::Close:
    close(*db);
    return {};
  case Op::SyncLibSQL:
    call.check(libsql_sync(db->db, &call.error));
    return {};
  case Op::Exec:
    call.check(libsql_execute(db->conn, args[1].get<std::string>().c_str(), &call.error));
    return {};
  case Op::Prepare: {
    auto stmt = std::make_shared<Statement>(db);
    call.check(libsql_prepare(db->conn, args[1].get<std::string>().c_str(), &stmt->stmt, &call.error));

    db->statements.erase(
        std::remove_if(db->statements.begin(), db->statements.end(), [](auto &s) { return s.expired(); }),
        db->statements.end());
    db->statements.emplace_back(stmt);

    return Handle(stmt);
  }
  default:
    throw NativeError("ERR_UNSUPPORTED_OPERATION", "Unsupported operation in libSQL mode");
  }
}
