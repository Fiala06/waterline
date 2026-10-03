// Every 5 minutes: reminders and digests (unless the admin turned them off in
// Server settings), and tidying up. EMAIL_SCHEDULER=off stops all of it.
import { env } from '$env/dynamic/private';
import { pruneActionTokens } from './action-tokens';
import { pruneSamples } from './sensors';
import { pruneOAuth } from './assistant/oauth';
import { cleanupExports } from './export';
import { getServerSettings } from './mail';
import { logger, pruneLogs } from './log';
import { runNotifications } from './notifications';
import { ensureCare } from './species-care';

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
			pruneLogs();
			pruneActionTokens();
			pruneSamples();
			pruneOAuth();
			cleanupExports();
			// species care data from FishBase (#20), once, when the server hasn't got it
			await ensureCare();
		} catch (e) {
			logger.error('server', 'The scheduled run failed', { error: e });
		} finally {
			running = false;
		}
	};
	g.__waterlineScheduler = setInterval(tick, EVERY_MS);
	setTimeout(tick, 10_000);
}
