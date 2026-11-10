// Every 5 minutes: reminders and digests (unless the admin turned them off in
// Server settings), and tidying up. EMAIL_SCHEDULER=off stops all of it.
import { env } from '$env/dynamic/private';
import { pruneActionTokens } from './action-tokens';
import { pollAllDevices } from './devices';
import { pollAllPlugs } from './plugs';
import { logDueDoses } from './dosers';
import { pruneSamples } from './sensors';
import { pruneOAuth } from './assistant/oauth';
import { cleanupExports } from './export';
import { pruneShareImages } from './og-cache';
import { getServerSettings } from './mail';
import { logger, pruneLogs } from './log';
import { alertSensorExcursions, runNotifications } from './notifications';
import { ensureCare } from './species-care';

const EVERY_MS = 5 * 60_000;
const g = globalThis as { __waterlineScheduler?: ReturnType<typeof setInterval> };

type Job = [name: string, run: () => unknown];

const JOBS: Job[] = [
	// the doses dosers make (#196), logged at their time
	['dosers', () => logDueDoses()],
	['reminders', () => (getServerSettings().scheduledEmails ? runNotifications() : undefined)],
	// devices Waterline reads itself, every run: 5 minutes apart
	['devices', () => pollAllDevices()],
	// smart plugs (#203): an item off at its plug is paused, back on resumes
	['plugs', () => pollAllPlugs()],
	// a sensor that is a parameter's reading of record, out of range for a while
	['sensor alerts', () => alertSensorExcursions()],
	['logs', () => pruneLogs()],
	['links', () => pruneActionTokens()],
	['readings', () => pruneSamples()],
	['connections', () => pruneOAuth()],
	['exports', () => cleanupExports()],
	['share images', () => pruneShareImages()],
	// species care data from FishBase (#20), once, when the server hasn't got it
	['species care', () => ensureCare()]
];

/**
 * A run: each job in turn, and one that fails is logged and doesn't stop the
 * ones after it (#211). Gives the names of those that failed.
 */
export async function runJobs(jobs: Job[]): Promise<string[]> {
	const failed: string[] = [];
	for (const [name, run] of jobs) {
		try {
			await run();
		} catch (e) {
			failed.push(name);
			logger.error('server', `The scheduled run's ${name} step failed`, { error: e });
		}
	}
	return failed;
}

export function startScheduler() {
	if (env.EMAIL_SCHEDULER === 'off' || g.__waterlineScheduler) return;
	let running = false;
	const tick = async () => {
		if (running) return;
		running = true;
		try {
			await runJobs(JOBS);
		} finally {
			running = false;
		}
	};
	g.__waterlineScheduler = setInterval(tick, EVERY_MS);
	setTimeout(tick, 10_000);
}
