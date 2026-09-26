import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const dataDir = env.DATA_DIR ?? './data';
mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(join(dataDir, 'waterline.db'));
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: env.MIGRATIONS_DIR ?? './drizzle' });

export { schema };
