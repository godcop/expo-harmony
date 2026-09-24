import * as SQLite from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { useState } from 'react';

import { ActionButton, ActionRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

const NAME = 'expo-harmony-demo.db';
const TABLE = 'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)';

export function SQLiteDemo() {
  const [value, setValue] = useState('Hello HarmonyOS · SQLite 数据库');
  const action = useAsyncResult();
  const checks = useAsyncResult();
  const advanced = useAsyncResult();
  const busy = [action, checks, advanced].some(result => result.state.phase === 'running');

  return (
    <>
      <Panel eyebrow="持久存储" title="同步、异步与重启后读回">
        <Field label="内容" multiline onChangeText={setValue} testID="sqlite-value" value={value} />
        <ActionRow>
          <ActionButton disabled={busy} label="异步写入" onPress={() => void action.run(() => save(value))} testID="sqlite-write" />
          <ActionButton disabled={busy} label="同步写入" onPress={() => void action.run(() => saveSync(value))} testID="sqlite-write-sync" tone="secondary" />
          <ActionButton disabled={busy} label="读取数据" onPress={() => void action.run(read)} testID="sqlite-read" tone="secondary" />
          <ActionButton
            disabled={busy}
            label="删除数据库"
            onPress={() => void action.run(async () => {
              await SQLite.deleteDatabaseAsync(NAME);

              return '演示数据库已删除。';
            })}
            testID="sqlite-delete"
            tone="danger"
          />
        </ActionRow>
        <Note>每次操作都会关闭连接。写入后重启应用，再读取同一数据库以检查持久化；删除只影响本页的演示数据库。</Note>
        <ResultPanel state={action.state} />
      </Panel>

      <Panel eyebrow="SQL 检查" title="参数、游标、事务与错误恢复">
        <ActionRow>
          <ActionButton disabled={busy} label="运行 SQL 检查" onPress={() => void checks.run(verify)} testID="sqlite-verify" />
          <ActionButton disabled={busy} label="运行生命周期检查" onPress={() => void checks.run(lifecycle)} testID="sqlite-lifecycle" tone="secondary" />
        </ActionRow>
        <Note>使用独立内存数据库，检查命名参数、NUL 文本、BLOB、游标复用、事务回滚，以及空 SQL 和关闭后访问。完成后释放连接与 statement。</Note>
        <ResultPanel state={checks.state} />
      </Panel>

      <Panel eyebrow="扩展能力" title="快照、Session、通知与键值存储">
        <ActionRow>
          <ActionButton disabled={busy} label="备份与 Session" onPress={() => void advanced.run(snapshots)} testID="sqlite-snapshots" />
          <ActionButton disabled={busy} label="检查变更事件" onPress={() => void advanced.run(notifications)} testID="sqlite-events" tone="secondary" />
          <ActionButton disabled={busy} label="检查 kv-store" onPress={() => void advanced.run(storage)} testID="sqlite-storage" tone="secondary" />
        </ActionRow>
        <Note>
          快照与 Session 在内存中执行；变更监听使用临时文件并自动清理。kv-store 使用官方 JavaScript 实现，只删除本次创建的键。
          SQLCipher、libSQL 和 sqlite-vec 需另行启用原生构建选项。
        </Note>
        <ResultPanel state={advanced.state} />
      </Panel>
    </>
  );
}

async function save(value: string): Promise<string> {
  const db = await SQLite.openDatabaseAsync(NAME);

  try {
    await db.execAsync(TABLE);
    const result = await db.runAsync('INSERT INTO notes (body) VALUES (?)', value);

    return `异步写入成功：id=${result.lastInsertRowId}，changes=${result.changes}`;
  } finally {
    await db.closeAsync();
  }
}

function saveSync(value: string): string {
  const db = SQLite.openDatabaseSync(NAME);

  try {
    db.execSync(TABLE);
    const result = db.runSync('INSERT INTO notes (body) VALUES (?)', value);

    return `同步写入成功：id=${result.lastInsertRowId}，changes=${result.changes}`;
  } finally {
    db.closeSync();
  }
}

async function read(): Promise<string> {
  const db = await SQLite.openDatabaseAsync(NAME);

  try {
    await db.execAsync(TABLE);
    const rows = await db.getAllAsync('SELECT * FROM notes ORDER BY id');

    return JSON.stringify(rows, null, 2);
  } finally {
    await db.closeAsync();
  }
}

async function verify(): Promise<string> {
  const db = await SQLite.openDatabaseAsync(':memory:', { useNewConnection: true });
  const rows: string[] = [];

  try {
    await db.execAsync(`CREATE TABLE items (
      id INTEGER PRIMARY KEY, text TEXT, bytes BLOB, empty BLOB, flag INTEGER, missing TEXT
    )`);
    const text = '中文\0SQLite 🚀';
    const bytes = new Uint8Array([0, 1, 127, 255]);
    const write = await db.runAsync('INSERT INTO items VALUES ($id, $text, $bytes, $empty, $flag, $missing)', {
      $id: 1, $text: text, $bytes: bytes, $empty: new Uint8Array(), $flag: true, $missing: null,
    });
    const row = db.getFirstSync<{
      text: string; bytes: Uint8Array; empty: Uint8Array; flag: number; missing: null;
    }>('SELECT * FROM items');
    if (write.changes !== 1 || write.lastInsertRowId !== 1 || row?.text !== text
      || Array.from(row.bytes).join() !== Array.from(bytes).join()
      || row.empty.length !== 0 || row.flag !== 1 || row.missing !== null) {
      throw new Error('命名参数或同步读回结果不一致。');
    }
    rows.push('命名参数、NUL 文本、BLOB、空 BLOB、布尔与 NULL：通过');

    const stmt = await db.prepareAsync('SELECT id FROM items WHERE id > ? ORDER BY id');
    try {
      const result = await stmt.executeAsync<{ id: number }>(0);
      if ((await result.getFirstAsync())?.id !== 1) throw new Error('游标首行不正确。');
      await result.resetAsync();
      if ((await result.getFirstAsync())?.id !== 1 || (await stmt.getColumnNamesAsync()).join() !== 'id') {
        throw new Error('游标复位或列名不正确。');
      }
      if ((await (await stmt.executeAsync(0)).getAllAsync()).length !== 1) throw new Error('读取全部结果失败。');
      if ((await (await stmt.executeAsync(1)).getAllAsync()).length !== 0) throw new Error('statement 复用未清空旧参数。');
    } finally {
      await stmt.finalizeAsync();
    }
    rows.push('游标读取、reset、列名、statement 复用：通过');

    await db.withTransactionAsync(async () => {
      if (!await db.isInTransactionAsync()) throw new Error('事务状态不正确。');
      await db.runAsync('INSERT INTO items (id) VALUES (?)', 2);
    });
    await rejects(() => db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO items (id) VALUES (?)', 3);
      throw new Error('演示回滚');
    }));
    if (db.isInTransactionSync() || db.getFirstSync<{ count: number }>('SELECT count(*) AS count FROM items')?.count !== 2) {
      throw new Error('事务提交或回滚不正确。');
    }
    rows.push('事务提交、回滚与事务状态：通过');

    await rejects(() => db.execAsync('SELECT * FROM missing_table'));
    db.runSync('UPDATE items SET text = ? WHERE id = ?', 'updated', 1);
    if ((await db.getFirstAsync<{ text: string }>('SELECT text FROM items WHERE id = 1'))?.text !== 'updated') {
      throw new Error('SQL 错误后无法继续读写。');
    }
    rows.push('SQL 错误后恢复、同步写入与异步读取：通过');

    return rows.join('\n');
  } finally {
    await db.closeAsync();
  }
}

async function lifecycle(): Promise<string> {
  const db = await SQLite.openDatabaseAsync(':memory:', { useNewConnection: true });

  try {
    for (const sql of ['', ' -- comment\n', '/* comment */;']) {
      const stmt = await db.prepareAsync(sql);
      try {
        if ((await stmt.getColumnNamesAsync()).length !== 0) throw new Error('空 SQL 应无列名。');
        await rejects(() => stmt.executeAsync(), 'ERR_INTERNAL_SQLITE_ERROR');
      } finally {
        await stmt.finalizeAsync();
      }
      await rejects(() => stmt.executeSync(), 'ERR_ACCESS_CLOSED_RESOURCE');
    }

    const stmt = db.prepareSync('SELECT 42 AS answer');
    try {
      if (stmt.executeSync<{ answer: number }>().getFirstSync()?.answer !== 42) throw new Error('同步 statement 失败。');
    } finally {
      stmt.finalizeSync();
    }
    await rejects(() => stmt.getColumnNamesAsync(), 'ERR_ACCESS_CLOSED_RESOURCE');
  } finally {
    await db.closeAsync();
  }

  await rejects(() => db.execAsync('SELECT 1'), 'ERR_ACCESS_CLOSED_RESOURCE');

  return '空 SQL 准备、执行错误、finalize：通过\n同步 statement 与关闭后访问拒绝：通过';
}

async function snapshots(): Promise<string> {
  const source = await SQLite.openDatabaseAsync(':memory:', { useNewConnection: true });
  let target: SQLite.SQLiteDatabase | undefined;
  let restored: SQLite.SQLiteDatabase | undefined;

  try {
    target = await SQLite.openDatabaseAsync(':memory:', { useNewConnection: true });
    await source.execAsync(TABLE);
    await source.runAsync('INSERT INTO notes VALUES (?, ?)', 1, 'snapshot');
    await SQLite.backupDatabaseAsync({ sourceDatabase: source, destDatabase: target });
    restored = SQLite.deserializeDatabaseSync(await source.serializeAsync());
    if ((await target.getFirstAsync<{ body: string }>('SELECT body FROM notes'))?.body !== 'snapshot'
      || restored.getFirstSync<{ body: string }>('SELECT body FROM notes')?.body !== 'snapshot') {
      throw new Error('备份或序列化往返不一致。');
    }

    const session = await source.createSessionAsync();
    const receiver = target.createSessionSync();
    try {
      await session.attachAsync('notes');
      await source.runAsync('INSERT INTO notes VALUES (?, ?)', 2, 'changeset');
      const changes = await session.createChangesetAsync();
      await receiver.applyChangesetAsync(changes);
      if (target.getFirstSync<{ body: string }>('SELECT body FROM notes WHERE id = 2')?.body !== 'changeset') {
        throw new Error('应用 changeset 失败。');
      }
      receiver.applyChangesetSync(await session.invertChangesetAsync(changes));
      if (await target.getFirstAsync('SELECT * FROM notes WHERE id = 2') !== null) throw new Error('反向 changeset 失败。');
    } finally {
      receiver.closeSync();
      await session.closeAsync();
    }

    return '数据库 backup：通过\nserialize / deserialize：通过\nSession changeset / invert / apply：通过';
  } finally {
    await Promise.all([restored?.closeAsync(), target?.closeAsync(), source.closeAsync()]);
  }
}

async function notifications(): Promise<string> {
  const name = `expo-harmony-events-${Date.now()}.db`;
  const db = await SQLite.openDatabaseAsync(name, { enableChangeListener: true, useNewConnection: true });
  const events: SQLite.DatabaseChangeEvent[] = [];
  const listener = SQLite.addDatabaseChangeListener((event) => {
    if (event.databaseFilePath === db.databasePath && event.tableName === 'notes') events.push(event);
  });

  try {
    await db.execAsync(TABLE);
    await db.runAsync('INSERT INTO notes VALUES (?, ?)', 1, 'event');
    await db.runAsync('UPDATE notes SET body = ? WHERE id = ?', 'updated', 1);
    await db.runAsync('DELETE FROM notes WHERE id = ?', 1);
    for (let attempt = 0; events.length < 3 && attempt < 30; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (events.length !== 3 || events.some(event => event.rowId !== 1)) {
      throw new Error(`预期 3 次变更事件，实际：${JSON.stringify(events)}`);
    }

    return `insert / update / delete 事件：通过\n${JSON.stringify(events, null, 2)}`;
  } finally {
    listener.remove();
    await db.closeAsync();
    await SQLite.deleteDatabaseAsync(name);
  }
}

async function storage(): Promise<string> {
  const key = `expo-harmony-demo.${Date.now()}`;

  try {
    await Storage.setItemAsync(key, 'hello');
    if (Storage.getItemSync(key) !== 'hello') throw new Error('kv-store 同步读取失败。');
    Storage.setItemSync(key, 'updated');
    if (await Storage.getItemAsync(key) !== 'updated') throw new Error('kv-store 异步读取失败。');
    await Storage.removeItemAsync(key);
    if (Storage.getItemSync(key) !== null) throw new Error('kv-store 删除失败。');

    return '官方 kv-store 同步/异步交叉读写与删除：通过';
  } finally {
    await Storage.removeItemAsync(key);
  }
}

async function rejects(operation: () => unknown, code?: string): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (!(error instanceof Error) || (code !== undefined && (!('code' in error) || error.code !== code))) {
      throw new Error(`预期错误 ${code ?? 'Error'}，实际：${String(error)}`);
    }

    return;
  }

  throw new Error(`操作未拒绝，预期：${code ?? 'Error'}`);
}
