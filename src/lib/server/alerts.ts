// What the bell and the Alerts page (#195) list: every reading out of range
// and every overdue task across the tanks this person can see, built from the
// queries the shell runs for its sidebar anyway. The admin's update notice is
// added by the shell, which knows whether one is out.
import { fmtRange, fmtValue, paramUnit, shortName, statusOf } from '$lib/params';
import { dueInfo, intervalText } from '$lib/tasks';
import { fmtWhen } from '$lib/time';
import type { UnitPrefs } from '$lib/units';
import { readingKey, taskKey, type Alert, type ReadingAlert, type TaskAlert } from '$lib/alerts';
import type { LatestReading } from './logs';
import type { listParamsFor } from './tanks';
import type { listTasks } from './tasks';

export function collectAlerts(opts: {
	user: UnitPrefs & { timeZone: string };
	tanks: { id: string; name: string }[];
	/** every task with a date, as listTasks gives them */
	tasks: ReturnType<typeof listTasks>;
	paramsOf: ReturnType<typeof listParamsFor>;
	latestOf: Map<string, Map<string, LatestReading>>;
	today: string;
}): Alert[] {
	const { user, tanks, tasks, paramsOf, latestOf, today } = opts;
	const nameOf = new Map(tanks.map((t) => [t.id, t.name]));

	const readings: ReadingAlert[] = [];
	for (const t of tanks) {
		const latest = latestOf.get(t.id);
		for (const p of paramsOf.get(t.id) ?? []) {
			const r = latest?.get(p.id);
			if (!r) continue;
			const st = statusOf(p, r.value);
			if (st.level !== 'bad' || !st.direction) continue;
			const value = `${fmtValue(p, r.value, user)} ${paramUnit(p, user)}`.trim();
			const when = fmtWhen(r.takenAt, user.timeZone);
			readings.push({
				kind: 'reading',
				// a sensor's reading keeps one key while its stretch out of range lasts, so Mark read holds
				key: readingKey(p.id, r.since ?? r.takenAt),
				tankId: t.id,
				tankName: t.name,
				paramId: p.id,
				direction: st.direction,
				status: st.direction === 'low' ? '✕ Low' : '✕ High',
				value,
				range: fmtRange(p, user),
				when,
				takenAt: r.takenAt,
				sensor: r.sensor ?? null,
				title: `${shortName(p)} ${st.direction} · ${value}`,
				sub: `${t.name} · ${r.sensor ? `${r.sensor} · ` : ''}${when}`,
				href: `/charts?tank=${t.id}&p=${p.id}`,
				logHref: `/entries/test/new?tank=${t.id}`,
				lo: p.min,
				hi: p.max
			});
		}
	}
	// the newest reading first
	readings.sort((a, b) => b.takenAt.localeCompare(a.takenAt));

	// listTasks comes sorted by date, so the most overdue is first
	const overdue: TaskAlert[] = [];
	for (const { task } of tasks) {
		const d = dueInfo(task.due, today, task.graceDays);
		if (d.section !== 'overdue') continue;
		const tankName = nameOf.get(task.tankId) ?? '';
		overdue.push({
			kind: 'task',
			key: taskKey(task.id, task.due),
			tankId: task.tankId,
			tankName,
			taskId: task.id,
			dueText: d.text,
			every: intervalText(task),
			ownDone: task.kind === 'review' || (task.openFormOnDone && (task.kind === 'water_change' || task.kind === 'test')),
			title: task.name,
			sub: `${tankName} · ${d.text}`,
			href: `/tasks?filter=${task.tankId}&edit=${task.id}`,
			task: {
				id: task.id,
				name: task.name,
				due: task.due,
				tankId: task.tankId,
				kind: task.kind,
				recurring: task.recurring,
				intervalDays: task.intervalDays,
				scheduleMode: task.scheduleMode ?? undefined,
				nextDue: task.nextDue,
				weekdays: task.weekdays,
				endsOn: task.endsOn
			}
		});
	}
	return [...readings, ...overdue];
}
