import { dueInfo } from '$lib/tasks';
import { fmtWhen, todayInZone } from '$lib/time';
import { statusOf } from '$lib/params';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { displayVersion, VERSION } from '$lib/changelog';
import { takeFlash } from '$lib/server/flash';
import { latestReadings, latestTest } from '$lib/server/logs';
import { listParams, listTanks } from '$lib/server/tanks';
import { listTasks } from '$lib/server/tasks';
import { availableUpdate, projectPage } from '$lib/server/updates';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url, cookies, params, route }) => {
	const user = locals.user!;
	const tanks = listTanks(user.id);
	const today = todayInZone(user.timeZone);

	// A tank's own pages make it the current tank, as picking it in the switcher does.
	const routeTank = route.id?.startsWith('/(app)/tanks/[id]') ? params.id : undefined;
	const requested = url.searchParams.get('tank') ?? routeTank ?? null;
	let currentTankId = requested ?? cookies.get('wl_tank') ?? null;
	if (!tanks.some((t) => t.id === currentTankId)) currentTankId = tanks[0]?.id ?? null;
	if (requested && currentTankId === requested) {
		cookies.set('wl_tank', requested, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 31536000 });
	}

	const tasks = listTasks(user.id);
	const overdueByTank = new Map<string, number>();
	let overdueCount = 0;
	for (const { task } of tasks) {
		if (dueInfo(task.due, today).section === 'overdue') {
			overdueCount++;
			overdueByTank.set(task.tankId, (overdueByTank.get(task.tankId) ?? 0) + 1);
		}
	}

	const summaries = tanks.map((t) => {
		const latest = latestReadings(t.id);
		const outOfRange = listParams(t.id).filter(
			(p) => statusOf(p, latest.get(p.id)?.value).level === 'bad'
		).length;
		return {
			id: t.id,
			name: t.name,
			type: t.type,
			volume:
				t.nominalVolumeL != null
					? `${formatNumber(toDisplay(t.nominalVolumeL, 'volume', user), 0)} ${unitLabel('volume', user)}`
					: null,
			startDate: t.startDate,
			cover: t.coverPhotoId,
			alerts: outOfRange + (overdueByTank.get(t.id) ?? 0),
			// never tested: "No data", not "All good"
			tested: latest.size > 0
		};
	});

	// Context for the quick-add sheet.
	const lastTest = currentTankId ? latestTest(currentTankId) : undefined;
	const wcTask = tasks.find((r) => r.task.tankId === currentTankId && r.task.kind === 'water_change')?.task;

	const flash = takeFlash(cookies);
	return {
		user: {
			id: user.id,
			email: user.email,
			displayName: user.displayName,
			isAdmin: user.isAdmin,
			unitSystem: user.unitSystem,
			hardnessUnit: user.hardnessUnit,
			timeZone: user.timeZone,
			theme: user.theme,
			// the account menu's photo; a new address each time it's copied again
			avatar: user.avatarAt ? `/avatar?v=${Date.parse(user.avatarAt)}` : null
		},
		tanks: summaries,
		currentTankId,
		overdueCount,
		quick: {
			lastTest: lastTest ? `Last test ${fmtWhen(lastTest.takenAt, user.timeZone).replace(/^Today/, 'today').replace(/^Yesterday/, 'yesterday')}` : 'No tests yet',
			wcDue: wcTask ? dueInfo(wcTask.due, today) : null
		},
		flash: flash ? { ...flash, id: crypto.randomUUID() } : null,
		// the version running; a newer release only for admins, who can update the server
		app: { version: displayVersion(VERSION), update: user.isAdmin ? availableUpdate() : null, repo: projectPage() }
	};
};
