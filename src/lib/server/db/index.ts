import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import * as schema from './schema';
import { fold } from '../../search';

const dataDir = env.DATA_DIR ?? './data';
mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(join(dataDir, 'waterline.db'));
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
// History's search (#312): text folded the same way in SQL as in the app, accents and case aside
sqlite.function('wl_fold', { deterministic: true }, (v: unknown) => (v == null ? null : fold(String(v))));

export const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: env.MIGRATIONS_DIR ?? './drizzle' });

export { schema };
