
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations(
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT now()
  )
`);

const dir = path.resolve(process.env.MIGRATIONS_DIR || 'db/migrations');
const files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();
for (const file of files) {
  const exists = await pool.query(`SELECT 1 FROM schema_migrations WHERE filename=$1`, [file]);
  if (exists.rowCount) continue;
  const sql = await fs.readFile(path.join(dir, file), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(`INSERT INTO schema_migrations(filename) VALUES($1)`, [file]);
    await client.query('COMMIT');
    logger.info({ migration: file }, 'migration applied');
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error({ err: e, migration: file }, 'migration failed');
    throw e;
  } finally {
    client.release();
  }
}
await pool.end();
logger.info('migrations complete');
