import { error } from '@sveltejs/kit';
import { VERSION } from '$lib/changelog';
import { LOG_LEVELS } from '$lib/server/db/schema';
import { allLogs, KEEP_DAYS, type LogLevel } from '$lib/server/log';
import { formatLine } from '$lib/server/log-format';
import type { RequestHandler } from './$types';

/** The log as a text file, to share when asking for help: email addresses shortened, account ids cut. */
export const GET: RequestHandler = ({ locals, url }) => {
	if (!locals.user?.isAdmin) error(404, 'Not found');
	const raw = url.searchParams.get('level');
	const level = raw && (LOG_LEVELS as readonly string[]).includes(raw) ? (raw as LogLevel) : null;
	const now = new Date().toISOString();
	const lines = [
		`# Waterline ${VERSION} · log from ${now}${level ? ` · ${level} only` : ''}`,
		`# The last ${KEEP_DAYS} days, oldest first. Email addresses are shortened (a***@example.com).`,
		...allLogs(level).map(formatLine)
	];
	return new Response(`${lines.join('\n')}\n`, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'content-disposition': `attachment; filename="waterline-log-${now.slice(0, 10)}.txt"`,
			'cache-control': 'no-store'
		}
	});
};
