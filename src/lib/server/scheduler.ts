// Every 5 minutes: reminders and digests (unless the admin turned them off in
// Server settings), and tidying up. EMAIL_SCHEDULER=off stops all of it.
import { env } from '$env/dynamic/private';
import { pruneActionTokens } from './action-tokens';
import { cleanupExports } from './export';
import { getServerSettings } from './mail';
import { runNotifications } from './notifications';

const EVERY_MS = 5 * 60_000;
const g = globalThis as { __waterlineScheduler?: ReturnType<typeof setInterval> };

export function startScheduler() {
	if (env.EMAIL_SCHEDULER === 'off' || g.__waterlineScheduler) return;
	let running = false;
	const tick = async () => {
		if (running) return;
		running = true;
		try {
			if (getServerSettings().scheduledEmails) await runNotifications();
			pruneActionTokens();
			cleanupExports();
		} catch (e) {
			console.error('[waterline] scheduler run failed:', e);
		} finally {
			running = false;
		}
	};
	g.__waterlineScheduler = setInterval(tick, EVERY_MS);
	setTimeout(tick, 10_000);
}
