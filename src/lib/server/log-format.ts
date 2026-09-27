// The log's rules, with no database behind them (log.ts writes and reads it):
// what a level lets through, what never gets written down, and the lines a
// download is made of.

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export const LEVEL_RANK: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

/** Whether the log keeps an entry of this level, with the detail set to `keep`. */
export const kept = (level: LogLevel, keep: LogLevel) => LEVEL_RANK[level] <= LEVEL_RANK[keep];

const SECRET = /pass(word)?|secret|token|api.?key|authorization|cookie|hash/i;

/** Details as they're stored: secrets hidden, long text cut, nothing that won't turn into JSON. */
export function redact(value: unknown, depth = 0): unknown {
	if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
	if (typeof value === 'string') return value.length > 4000 ? `${value.slice(0, 4000)}…` : value;
	if (depth > 4) return '…';
	if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
	if (typeof value === 'object') {
		return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET.test(k) ? '[hidden]' : redact(v, depth + 1)]));
	}
	return String(value);
}

/** What went wrong, from anything thrown: its message, kind and where. */
export function errorDetails(e: unknown): Record<string, unknown> {
	if (e instanceof Error) {
		const code = (e as { code?: unknown }).code;
		return {
			error: e.message,
			...(e.name && e.name !== 'Error' ? { kind: e.name } : {}),
			...(code != null ? { code } : {}),
			...(e.stack ? { stack: e.stack.split('\n').slice(0, 12).join('\n') } : {})
		};
	}
	return { error: String(e) };
}

/** a***@example.com: enough to tell accounts apart, not to give an address away */
export const maskEmails = (text: string) =>
	text.replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, (_, first: string, domain: string) => `${first}***@${domain}`);

/** One line of a download: when, level, area, message, account, reference and details. */
export function formatLine(e: { at: string; level: string; area: string; message: string; userId: string | null; ref: string | null; details: unknown }) {
	const parts = [e.at, e.level.toUpperCase().padEnd(5), e.area, e.message];
	if (e.ref) parts.push(`ref ${e.ref}`);
	if (e.userId) parts.push(`user ${e.userId.slice(0, 8)}`);
	const details = e.details && Object.keys(e.details as object).length ? ` ${JSON.stringify(e.details)}` : '';
	return maskEmails(parts.join(' · ') + details);
}
