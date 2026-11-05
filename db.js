/**
 * Lop truy cap database thong nhat.
 * - DATABASE_URL co gia tri -> PostgreSQL (goi pg)
 * - khong co -> SQLite tai data/meo.db (node:sqlite, khong can cai dat)
 * Cau lenh SQL dung chung, tham so hoa voi dau ?; adapter Postgres tu doi sang $1, $2...
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
const DEFAULT_SQLITE_FILE = path.join(__dirname, 'data', 'meo.db');

const MIGRATIONS = [
  {
    version: '001_accounts_history',
    statements: [
      `CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        avatar TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        last_login_at BIGINT NULL,
        deleted_at BIGINT NULL
      )`,
      `CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        last_seen_at BIGINT NOT NULL,
        user_agent TEXT NULL
      )`,
      `CREATE TABLE matches (
        id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL,
        size TEXT NOT NULL,
        win_length INTEGER NOT NULL,
        player_a_user_id TEXT NULL,
        player_b_user_id TEXT NULL,
        player_a_name TEXT NOT NULL,
        player_b_name TEXT NOT NULL,
        player_a_avatar TEXT NOT NULL,
        player_b_avatar TEXT NOT NULL,
        first_player TEXT NOT NULL,
        result TEXT NOT NULL,
        end_reason TEXT NOT NULL,
        win_line TEXT NULL,
        moves TEXT NOT NULL,
        total_moves INTEGER NOT NULL,
        started_at BIGINT NOT NULL,
        ended_at BIGINT NOT NULL
      )`,
      `CREATE TABLE user_stats (
        user_id TEXT NOT NULL,
        size_key TEXT NOT NULL,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        draws INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, size_key)
      )`,
      'CREATE INDEX idx_users_username ON users (username)',
      'CREATE INDEX idx_matches_a ON matches (player_a_user_id, ended_at)',
      'CREATE INDEX idx_matches_b ON matches (player_b_user_id, ended_at)',
      'CREATE INDEX idx_sessions_user ON sessions (user_id)',
      'CREATE INDEX idx_sessions_expires ON sessions (expires_at)',
    ],
  },
];

function splitSqlStatements(sql) {
  return sql
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

async function createSqliteAdapter(file) {
  let DatabaseSync = null;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } catch {
    throw new Error(
      'SQLite tích hợp cần Node.js >= 22.13. Hãy nâng Node hoặc đặt DATABASE_URL cho PostgreSQL.'
    );
  }

  const absolute = path.resolve(file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const sqlite = new DatabaseSync(absolute);
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA foreign_keys = ON');

  let chain = Promise.resolve();
  function enqueue(task) {
    const run = chain.then(task, task);
    chain = run.catch(() => {});
    return run;
  }

  function execute(sql, params) {
    const text = String(sql).trim();
    const statement = sqlite.prepare(text);
    if (/^(SELECT|WITH|PRAGMA)\b/i.test(text) || /\bRETURNING\b/i.test(text)) {
      const rows = statement.all(...params).map((row) => ({ ...row }));
      return { rows, rowCount: rows.length };
    }
    const info = statement.run(...params);
    return { rows: [], rowCount: Number(info.changes) || 0, lastId: info.lastInsertRowid };
  }

  return {
    kind: 'sqlite',
    async query(sql, params = []) {
      return enqueue(() => execute(sql, params));
    },
    async transaction(fn) {
      return enqueue(async () => {
        sqlite.exec('BEGIN IMMEDIATE');
        const tx = {
          query: async (sql, params = []) => execute(sql, params),
        };
        try {
          const result = await fn(tx);
          sqlite.exec('COMMIT');
          return result;
        } catch (error) {
          try {
            sqlite.exec('ROLLBACK');
          } catch {
            /* transaction da dong */
          }
          throw error;
        }
      });
    },
    async close() {
      await enqueue(() => sqlite.close());
    },
  };
}

async function createPostgresAdapter(url) {
  const { default: pg } = await import('pg');
  const needsSsl = /sslmode=require/i.test(url) || process.env.PGSSL === 'true';
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX) || 10,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });

  function toPositional(sql) {
    let index = 0;
    return String(sql).replace(/\?/g, () => `$${(index += 1)}`);
  }

  return {
    kind: 'postgres',
    async query(sql, params = []) {
      const result = await pool.query(toPositional(sql), params);
      return { rows: result.rows, rowCount: result.rowCount };
    },
    async transaction(fn) {
      const client = await pool.connect();
      const tx = {
        query: async (sql, params = []) => {
          const result = await client.query(toPositional(sql), params);
          return { rows: result.rows, rowCount: result.rowCount };
        },
      };
      try {
        await client.query('BEGIN');
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* ket noi da hong */
        }
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

let adapterPromise = null;

async function getAdapter() {
  if (!adapterPromise) {
    adapterPromise = DATABASE_URL
      ? createPostgresAdapter(DATABASE_URL)
      : createSqliteAdapter(process.env.DATABASE_FILE || DEFAULT_SQLITE_FILE);
  }
  return adapterPromise;
}

export async function query(sql, params = []) {
  const adapter = await getAdapter();
  return adapter.query(sql, params);
}

export async function transaction(fn) {
  const adapter = await getAdapter();
  return adapter.transaction(fn);
}

export async function migrate() {
  const adapter = await getAdapter();
  await adapter.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at BIGINT NOT NULL
    )`
  );

  for (const migration of MIGRATIONS) {
    const existing = await adapter.query(
      'SELECT version FROM schema_migrations WHERE version = ?',
      [migration.version]
    );
    if (existing.rows.length) continue;

    await adapter.transaction(async (tx) => {
      for (const sql of migration.statements.flatMap(splitSqlStatements)) {
        await tx.query(sql);
      }
      await tx.query('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [
        migration.version,
        Date.now(),
      ]);
    });
  }
}

export async function closeDatabase() {
  if (!adapterPromise) return;
  const adapter = await adapterPromise;
  await adapter.close();
  adapterPromise = null;
}

export function databaseKind() {
  return DATABASE_URL ? 'postgres' : 'sqlite';
}

export function newId() {
  return crypto.randomUUID();
}

export function isUniqueViolation(error) {
  if (!error) return false;
  if (error.code === '23505') return true;
  return /UNIQUE constraint failed/i.test(String(error.message || ''));
}
