// The server's log, for troubleshooting (Server settings › Logs): errors and
// warnings, and what the server did when the admin turns the detail up. Each
// entry is also printed to the console, which is the container's log. Old
// entries go after 30 days.
import { and, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { db } from './db';
import { logs, users } from './db/schema';
import { errorDetails, kept, redact, type LogLevel } from './log-format';
import { getServerSettings } from './mail';

export type { LogLevel };
export type LogArea = 'server' | 'request' | 'sign-in' | 'setup' | 'email' | 'import' | 'export' | 'settings' | 'update' | 'assistant';

interface Context {
	/** the account it's about */
	userId?: string | null;
	/** the reference an error page shows */
	ref?: string | null;
	error?: unknown;
	[key: string]: unknown;
}

export const KEEP_DAYS = 30;
const MAX_ROWS = 20_000;
let writes = 0;
let writing = false;

/** How much the log keeps now: errors and warnings, what the server does too, or everything while that's on. */
export function logDetail(now = Date.now()): LogLevel {
	try {
		const s = getServerSettings();
		if (s.logDebugUntil && Date.parse(s.logDebugUntil) > now) return 'debug';
		return s.logLevel;
	} catch {
		return 'warn';
	}
}

export function log(level: LogLevel, area: LogArea, message: string, context: Context = {}) {
	const { userId = null, ref = null, error, ...rest } = context;
	if (!kept(level, logDetail())) return;
	const details = redact({ ...rest, ...(error !== undefined ? errorDetails(error) : {}) }) as Record<string, unknown>;
	const some = Object.keys(details).length > 0;
	const line = `[waterline] ${area}: ${message}${ref ? ` (ref ${ref})` : ''}`;
	(level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line, ...(some ? [details] : []));
	// a failure while writing an entry isn't written down again; the console has it
	if (writing) return;
	writing = true;
	try {
		db.insert(logs)
			.values({ level, area, message: message.slice(0, 1000), details: some ? details : null, userId, ref })
			.run();
		if (++writes % 200 === 0) pruneLogs();
	} catch {
		/* the console has it */
	} finally {
		writing = false;
	}
}

export const logger = {
	error: (area: LogArea, message: string, context?: Context) => log('error', area, message, context),
	warn: (area: LogArea, message: string, context?: Context) => log('warn', area, message, context),
	info: (area: LogArea, message: string, context?: Context) => log('info', area, message, context),
	debug: (area: LogArea, message: string, context?: Context) => log('debug', area, message, context)
};

/** Old entries go: those past 30 days, and any beyond the newest 20,000. */
export function pruneLogs(now = Date.now()) {
	db.delete(logs)
		.where(lt(logs.at, new Date(now - KEEP_DAYS * 86_400_000).toISOString()))
		.run();
	const last = db.select({ id: logs.id }).from(logs).orderBy(desc(logs.id)).limit(1).offset(MAX_ROWS).get();
	if (last) db.delete(logs).where(lte(logs.id, last.id)).run();
}

/** Newest first, a page at a time, with the account each entry is about. */
export function listLogs(opts: { level?: LogLevel | null; ref?: string | null; before?: number | null; limit?: number } = {}) {
	const limit = opts.limit ?? 100;
	const rows = db
		.select({ entry: logs, email: users.email })
		.from(logs)
		.leftJoin(users, eq(users.id, logs.userId))
		.where(
			and(
				opts.level ? eq(logs.level, opts.level) : undefined,
				opts.ref ? eq(logs.ref, opts.ref) : undefined,
				opts.before ? lt(logs.id, opts.before) : undefined
			)
		)
		.orderBy(desc(logs.id))
		.limit(limit + 1)
		.all();
	return { rows: rows.slice(0, limit), more: rows.length > limit };
}

/** Entries at each level since a time: "2 errors and 5 warnings in the last day". */
export function logCounts(since: string): Record<LogLevel, number> {
	const out: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, debug: 0 };
	for (const r of db
		.select({ level: logs.level, n: sql<number>`count(*)` })
		.from(logs)
		.where(gte(logs.at, since))
		.groupBy(logs.level)
		.all()) {
		out[r.level] = r.n;
	}
	return out;
}

/** Everything kept, oldest first: what a download holds. */
export function allLogs(level?: LogLevel | null) {
	return db
		.select()
		.from(logs)
		.where(level ? eq(logs.level, level) : undefined)
		.orderBy(logs.id)
		.all();
}
