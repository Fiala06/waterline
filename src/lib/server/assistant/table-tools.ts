// Tables for dashboards and spreadsheets: the same read-only data as the other
// assistant tools, but as flat rows (`{ columns, rows: [{…}, …] }`), one row per
// reading, water change, task, expense or tank, across every tank the token may
// read unless a tank_id narrows it. Values are in the keeper's units, dates and
// times in their time zone, so a row reads the same as the app shows it.
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { WATER_SOURCES, additivesOf, additiveText } from '$lib/events';
import { displayValue, paramDecimals, paramUnit, statusOf } from '$lib/params';
import { effectiveDue } from '$lib/tasks';
import { daysBetween, todayInZone, utcToZoned } from '$lib/time';
import { toDisplay, unitLabel } from '$lib/units';
import { tankTypeLabel } from '$lib/types';
import { db } from '../db';
import { events, expenses, tasks, testReadings, tests, type Tank, type TankParameter, type User } from '../db/schema';
import { latestReadingsFor } from '../logs';
import { listLivestock, listPlants } from '../specs';
import { getTank, listParamsFor } from '../tanks';
import type { AssistantAccess } from './tokens';
import { ToolError, type Tool, type Args } from './tool-types';

const optionalTankArg = { type: 'string', description: 'Only this tank, an id from list_tanks. Every tank shared with you if left out.' };
const daysArg = (fallback: number, max: number) => ({
	type: 'integer',
	minimum: 1,
	maximum: max,
	description: `How many days back, up to ${max}. ${fallback} if left out.`
});

function days(args: Args, fallback: number, max: number) {
	const n = Number(args.days ?? fallback);
	return Number.isFinite(n) ? Math.min(max, Math.max(1, Math.round(n))) : fallback;
}
const sinceDays = (n: number, now = Date.now()) => new Date(now - n * 86_400_000).toISOString();

/** The tanks a table covers: the one asked for, or every tank the token may read (archived ones last). */
export function tanksFor(access: AssistantAccess, args: Args): Tank[] {
	const id = typeof args.tank_id === 'string' ? args.tank_id.trim() : '';
	if (id) {
		if (!access.tankIds.has(id)) throw new ToolError(`No tank ${id} is shared with this assistant. Call list_tanks for the ones that are.`);
		return [getTank(access.user.id, id)];
	}
	return [...access.tankIds]
		.map((t) => getTank(access.user.id, t))
		.sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt) || a.name.localeCompare(b.name));
}

/** "2026-10-07" and "18:18" in the keeper's time zone. */
function when(instant: string, user: User) {
	const z = utcToZoned(instant, user.timeZone);
	return { date: z.date, time: z.time };
}

const round = (n: number, d: number) => Number(n.toFixed(d));
const shown = (p: TankParameter, v: number, user: User) => round(displayValue(p, v, user), Math.max(paramDecimals(p, user), 2));
const bound = (p: TankParameter, v: number | null, user: User) => (v == null ? null : shown(p, v, user));

const LEVEL_WORD = { ok: 'OK', warn: 'Near', none: 'No data' } as const;
/** OK, Near, High, Low or No data: the word the app shows beside a reading. */
export function statusWord(p: TankParameter, stored: number | null | undefined) {
	const s = statusOf(p, stored);
	if (s.level === 'bad') return s.direction === 'low' ? 'Low' : 'High';
	return LEVEL_WORD[s.level];
}

const table = (columns: string[], rows: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({ kind: 'json' as const, data: { ...extra, columns, rows } });

// ── Readings ────────────────────────────────────────────────────────────────

const READING_COLUMNS = ['tank', 'tank_id', 'date', 'time', 'parameter', 'key', 'value', 'unit', 'target_min', 'target_max', 'status'];

export const readingRowsTool: Tool = {
	name: 'get_reading_rows',
	title: 'Readings as rows',
	description:
		"Water test readings as a flat table, one row per reading, oldest first: tank, date, time, parameter, value, unit, the parameter's target range and the reading's status (OK, Near, High, Low). Across every tank unless tank_id is given. Made for charts and spreadsheets; get_readings groups the same readings by parameter.",
	inputSchema: {
		type: 'object',
		properties: {
			tank_id: optionalTankArg,
			parameter: { type: 'string', description: 'Only this parameter, by name or key, e.g. "Nitrate", "no3", "pH". All if left out.' },
			days: daysArg(90, 3650)
		}
	},
	run: (access, args) => {
		const { user } = access;
		const list = tanksFor(access, args);
		const want = typeof args.parameter === 'string' ? args.parameter.trim().toLowerCase() : '';
		const since = sinceDays(days(args, 90, 3650));
		const paramsBy = listParamsFor(list.map((t) => t.id));
		const params = new Map<string, { p: TankParameter; tank: Tank }>();
		for (const t of list)
			for (const p of paramsBy.get(t.id) ?? []) if (!want || p.name.toLowerCase() === want || p.key === want) params.set(p.id, { p, tank: t });
		if (want && !params.size) throw new ToolError(`No tank here tracks "${args.parameter}".`);
		const ids = [...params.keys()];
		const rows = ids.length
			? db
					.select({ takenAt: tests.takenAt, parameterId: testReadings.parameterId, value: testReadings.value })
					.from(testReadings)
					.innerJoin(tests, eq(tests.id, testReadings.testId))
					.where(and(inArray(testReadings.parameterId, ids), gte(tests.takenAt, since)))
					.orderBy(asc(tests.takenAt))
					.all()
			: [];
		return table(
			READING_COLUMNS,
			rows.map((r) => {
				const { p, tank } = params.get(r.parameterId)!;
				return {
					tank: tank.name,
					tank_id: tank.id,
					...when(r.takenAt, user),
					parameter: p.name,
					key: p.key,
					value: shown(p, r.value, user),
					unit: paramUnit(p, user),
					target_min: bound(p, p.min, user),
					target_max: bound(p, p.max, user),
					status: statusWord(p, r.value)
				};
			})
		);
	}
};

// ── Water changes ───────────────────────────────────────────────────────────

const WATER_CHANGE_COLUMNS = ['tank', 'tank_id', 'date', 'time', 'percent', 'volume', 'volume_unit', 'source', 'additives', 'note'];

export const waterChangesTool: Tool = {
	name: 'get_water_changes',
	title: 'Water changes as rows',
	description:
		"Water changes as a flat table, newest first: tank, date, time, how much (percent, and the volume when it was logged or can be worked out from the tank's water volume), the water's source (Tap, RODI, Mix), what was added and the note. Across every tank unless tank_id is given.",
	inputSchema: { type: 'object', properties: { tank_id: optionalTankArg, days: daysArg(90, 3650) } },
	run: (access, args) => {
		const { user } = access;
		const list = tanksFor(access, args);
		const byId = new Map(list.map((t) => [t.id, t]));
		const since = sinceDays(days(args, 90, 3650));
		const rows = db
			.select()
			.from(events)
			.where(and(inArray(events.tankId, [...byId.keys()]), eq(events.category, 'water_change'), gte(events.occurredAt, since)))
			.orderBy(desc(events.occurredAt))
			.all();
		const vol = (l: number) => round(toDisplay(l, 'volume', user), 1);
		return table(
			WATER_CHANGE_COLUMNS,
			rows.map((e) => {
				const t = byId.get(e.tankId)!;
				const d = e.data;
				const water = t.actualVolumeL ?? t.nominalVolumeL;
				const pct = typeof d.percent === 'number' ? d.percent : typeof d.volume_l === 'number' && water ? (d.volume_l / water) * 100 : null;
				const litres = typeof d.volume_l === 'number' ? d.volume_l : pct != null && water ? (water * pct) / 100 : null;
				return {
					tank: t.name,
					tank_id: t.id,
					...when(e.occurredAt, user),
					percent: pct == null ? null : round(pct, 0),
					volume: litres == null ? null : vol(litres),
					volume_unit: unitLabel('volume', user),
					source: WATER_SOURCES.find((s) => s.value === d.source)?.label ?? null,
					additives: additivesOf(d).map(additiveText).join(', ') || null,
					note: e.note
				};
			})
		);
	}
};

// ── Tasks ───────────────────────────────────────────────────────────────────

const TASK_COLUMNS = ['tank', 'tank_id', 'task', 'kind', 'due', 'days_until_due', 'status', 'recurring', 'every_days', 'snoozed_until'];

/** Overdue, Due today, Due soon (within a week) or Upcoming. */
export function dueWord(daysUntil: number) {
	if (daysUntil < 0) return 'Overdue';
	if (daysUntil === 0) return 'Due today';
	if (daysUntil <= 7) return 'Due soon';
	return 'Upcoming';
}

export const tasksTool: Tool = {
	name: 'get_tasks',
	title: 'Tasks as rows',
	description:
		"Open tasks as a flat table, soonest first: tank, task, kind, when it's due (after any snooze), days until due (negative when overdue), status (Overdue, Due today, Due soon, Upcoming), whether it repeats and how often. Across every tank unless tank_id is given; archived tanks' tasks are left out.",
	inputSchema: { type: 'object', properties: { tank_id: optionalTankArg } },
	run: (access, args) => {
		const { user } = access;
		const list = tanksFor(access, args).filter((t) => !t.archivedAt);
		const byId = new Map(list.map((t) => [t.id, t]));
		const today = todayInZone(user.timeZone);
		const rows = list.length ? db.select().from(tasks).where(inArray(tasks.tankId, [...byId.keys()])).all() : [];
		return table(
			TASK_COLUMNS,
			rows
				.map((task) => ({ task, due: effectiveDue(task) }))
				.filter((r): r is { task: typeof r.task; due: string } => !!r.due)
				.sort((a, b) => a.due.localeCompare(b.due) || a.task.name.localeCompare(b.task.name))
				.map(({ task, due }) => {
					const n = daysBetween(today, due);
					return {
						tank: byId.get(task.tankId)!.name,
						tank_id: task.tankId,
						task: task.name,
						kind: task.kind,
						due,
						days_until_due: n,
						status: dueWord(n),
						recurring: task.recurring,
						every_days: task.recurring && task.scheduleMode !== 'weekdays' ? task.intervalDays : null,
						snoozed_until: task.snoozedUntil && task.snoozedUntil > (task.nextDue ?? '') ? task.snoozedUntil : null
					};
				}),
			{ today }
		);
	}
};

// ── Spending ────────────────────────────────────────────────────────────────

const SPENDING_COLUMNS = ['tank', 'tank_id', 'date', 'category', 'what', 'amount', 'currency', 'note'];

export const spendingTool: Tool = {
	name: 'get_spending',
	title: 'Spending as rows',
	description:
		"What's been spent on the tanks as a flat table, newest first: tank, date, category (livestock, plants, equipment, consumables, other), what, amount in the keeper's currency, and the note. Across every tank unless tank_id is given.",
	inputSchema: { type: 'object', properties: { tank_id: optionalTankArg, days: daysArg(3650, 3650) } },
	run: (access, args) => {
		const { user } = access;
		const list = tanksFor(access, args);
		const byId = new Map(list.map((t) => [t.id, t]));
		const since = sinceDays(days(args, 3650, 3650)).slice(0, 10);
		const rows = db
			.select()
			.from(expenses)
			.where(and(inArray(expenses.tankId, [...byId.keys()]), gte(expenses.date, since)))
			.orderBy(desc(expenses.date), desc(expenses.createdAt))
			.all();
		return table(
			SPENDING_COLUMNS,
			rows.map((x) => ({
				tank: byId.get(x.tankId)!.name,
				tank_id: x.tankId,
				date: x.date,
				category: x.category,
				what: x.what,
				amount: x.amountCents / 100,
				currency: user.currency,
				note: x.note
			}))
		);
	}
};

// ── Overview ────────────────────────────────────────────────────────────────

const OVERVIEW_COLUMNS = [
	'tank',
	'tank_id',
	'type',
	'water_volume',
	'volume_unit',
	'archived',
	'last_tested',
	'days_since_test',
	'last_water_change',
	'days_since_water_change',
	'readings_ok',
	'readings_near',
	'readings_out',
	'out_of_range',
	'tasks_overdue',
	'tasks_due_7_days',
	'livestock',
	'plants'
];

export const overviewTool: Tool = {
	name: 'get_overview',
	title: 'Tanks at a glance',
	description:
		"One row per tank with the numbers a dashboard leads with: when it was last tested and last had a water change (and how many days ago), how many parameters' latest readings are OK, near a limit or out of range (and which are out), tasks overdue and due within a week, and how many animals and plants it holds.",
	inputSchema: { type: 'object', properties: { tank_id: optionalTankArg } },
	run: (access, args) => {
		const { user } = access;
		const list = tanksFor(access, args);
		const ids = list.map((t) => t.id);
		const today = todayInZone(user.timeZone);
		const paramsBy = listParamsFor(ids);
		const latest = latestReadingsFor(ids);
		const lastTest = (id: string) => db.select({ at: tests.takenAt }).from(tests).where(eq(tests.tankId, id)).orderBy(desc(tests.takenAt)).limit(1).get()?.at ?? null;
		const lastChange = (id: string) =>
			db
				.select({ at: events.occurredAt })
				.from(events)
				.where(and(eq(events.tankId, id), eq(events.category, 'water_change')))
				.orderBy(desc(events.occurredAt))
				.limit(1)
				.get()?.at ?? null;
		const openTasks = ids.length ? db.select().from(tasks).where(inArray(tasks.tankId, ids)).all() : [];
		const ago = (at: string | null) => (at ? daysBetween(when(at, user).date, today) : null);
		return table(
			OVERVIEW_COLUMNS,
			list.map((t) => {
				const counts = { OK: 0, Near: 0, out: [] as string[] };
				for (const p of paramsBy.get(t.id) ?? []) {
					const l = latest.get(t.id)?.get(p.id);
					if (!l) continue;
					const w = statusWord(p, l.value);
					if (w === 'OK') counts.OK++;
					else if (w === 'Near') counts.Near++;
					else if (w === 'High' || w === 'Low') counts.out.push(`${p.name} ${w.toLowerCase()}`);
				}
				const due = t.archivedAt
					? []
					: openTasks
							.filter((x) => x.tankId === t.id)
							.map((x) => effectiveDue(x))
							.filter((d): d is string => !!d)
							.map((d) => daysBetween(today, d));
				const tested = lastTest(t.id);
				const changed = lastChange(t.id);
				const water = t.actualVolumeL ?? t.nominalVolumeL;
				return {
					tank: t.name,
					tank_id: t.id,
					type: tankTypeLabel(t.type),
					water_volume: water == null ? null : round(toDisplay(water, 'volume', user), 1),
					volume_unit: unitLabel('volume', user),
					archived: !!t.archivedAt,
					last_tested: tested ? when(tested, user).date : null,
					days_since_test: ago(tested),
					last_water_change: changed ? when(changed, user).date : null,
					days_since_water_change: ago(changed),
					readings_ok: counts.OK,
					readings_near: counts.Near,
					readings_out: counts.out.length,
					out_of_range: counts.out.join(', ') || null,
					tasks_overdue: due.filter((n) => n < 0).length,
					tasks_due_7_days: due.filter((n) => n >= 0 && n <= 7).length,
					livestock: listLivestock(user.id, t.id).reduce((n, l) => n + (l.count ?? 1), 0),
					plants: listPlants(user.id, t.id).length
				};
			}),
			{ today }
		);
	}
};

export const TABLE_TOOLS: Tool[] = [overviewTool, readingRowsTool, waterChangesTool, tasksTool, spendingTool];

/** Rows as CSV, columns in the table's order, for `?format=csv` on the JSON API. */
export function toCsv(columns: string[], rows: Record<string, unknown>[]) {
	const cell = (v: unknown) => {
		if (v == null) return '';
		const s = typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
		// guard against formulas when the file is opened in a spreadsheet
		const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
		return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
	};
	return [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}
