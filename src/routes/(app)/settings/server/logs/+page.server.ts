import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { LOG_LEVELS, serverSettings } from '$lib/server/db/schema';
import { KEEP_DAYS, listLogs, logCounts, logger, type LogLevel } from '$lib/server/log';
import { getServerSettings } from '$lib/server/mail';
import type { Actions, PageServerLoad } from './$types';

const DEBUG_HOURS = 24;

function requireAdmin(locals: App.Locals) {
	if (!locals.user?.isAdmin) error(404, 'Not found');
	return locals.user;
}

const isLevel = (v: string | null): v is LogLevel => !!v && (LOG_LEVELS as readonly string[]).includes(v);
const stamp = (iso: string, timeZone: string) =>
	new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone });

export const load: PageServerLoad = ({ locals, url }) => {
	const user = requireAdmin(locals);
	const level = isLevel(url.searchParams.get('level')) ? (url.searchParams.get('level') as LogLevel) : null;
	const ref = url.searchParams.get('ref')?.trim().toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 16) || null;
	const before = Number(url.searchParams.get('before')) || null;
	const { rows, more } = listLogs({ level, ref, before });
	const s = getServerSettings();
	const debugOn = !!s.logDebugUntil && Date.parse(s.logDebugUntil) > Date.now();
	return {
		level,
		ref,
		entries: rows.map(({ entry: e, email }) => ({
			id: e.id,
			when: stamp(e.at, user.timeZone),
			level: e.level,
			area: e.area,
			message: e.message,
			// one "name: value" line each; a stack keeps its lines
			details: e.details && Object.keys(e.details).length
				? Object.entries(e.details)
						.map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
						.join('\n')
				: null,
			email,
			ref: e.ref
		})),
		more,
		oldest: rows.at(-1)?.entry.id ?? null,
		counts: logCounts(new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString()),
		detail: debugOn ? 'debug' : s.logLevel,
		debugUntil: debugOn ? stamp(s.logDebugUntil!, user.timeZone) : null,
		keepDays: KEEP_DAYS
	};
};

export const actions: Actions = {
	/** What the log keeps: errors and warnings, what the server does too, or everything for a day. */
	detail: async ({ request, locals }) => {
		const user = requireAdmin(locals);
		const v = String((await request.formData()).get('detail') ?? '');
		getServerSettings();
		const patch =
			v === 'debug'
				? { logDebugUntil: new Date(Date.now() + DEBUG_HOURS * 3_600_000).toISOString() }
				: { logLevel: v === 'info' ? ('info' as const) : ('warn' as const), logDebugUntil: null };
		db.update(serverSettings).set(patch).where(eq(serverSettings.id, 1)).run();
		logger.info('settings', v === 'debug' ? `Log keeps everything for the next ${DEBUG_HOURS} hours` : v === 'info' ? 'Log keeps what the server does too' : 'Log keeps errors and warnings', {
			userId: user.id
		});
		return { detailSaved: true };
	}
};
