#!/usr/bin/env node
/**
 * Chay migration thu cong: npm run migrate
 * Tuong thich ca SQLite (mac dinh) va PostgreSQL qua DATABASE_URL.
 */
import { closeDatabase, databaseKind, migrate } from '../db.js';

try {
  await migrate();
  console.log(`[mmc] migrations up to date (${databaseKind()})`);
} catch (error) {
  console.error('[mmc] migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
