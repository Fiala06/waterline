// Runs the notification job every 5 minutes. Set EMAIL_SCHEDULER=off to disable.
import { env } from '$env/dynamic/private';
import { pruneActionTokens } from './action-tokens';
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
			await runNotifications();
			pruneActionTokens();
		} catch (e) {
			console.error('[waterline] scheduler run failed:', e);
		} finally {
			running = false;
		}
	};
	g.__waterlineScheduler = setInterval(tick, EVERY_MS);
	setTimeout(tick, 10_000);
}
