import { and, desc, eq as is, sql } from 'drizzle-orm';
import { GROWING_STYLE_LABEL } from '$lib/types';
import { listRoutines } from './routines';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { dateInZone, fmtDateLong, todayInZone } from '$lib/time';
import { dueInfo, isRoutine, routineLine } from '$lib/tasks';
import { db } from './db';
import { events, type Tank, type User } from './db/schema';
import { listTasks } from './tasks';

const SOURCES: Record<string, string> = { tap: 'Tap', rodi: 'RODI', mix: 'Mix', well: 'Well' };

/**
 * A tank's specs, pinned note, latest dated notes and routines: the sections
 * shown on Notes & routines (/tanks/[id]) and at the end of Setup › Details.
 */
export function tankDetails(user: User, t: Tank) {
	const today = todayInZone(user.timeZone);
	const len = (cm: number) => formatNumber(toDisplay(cm, 'length', user), 0);
	const size =
		t.lengthCm && t.widthCm && t.heightCm
			? `${len(t.lengthCm)} × ${len(t.widthCm)} × ${len(t.heightCm)} ${unitLabel('length', user)}`
			: null;
	return {
		// T1 order
		specs: [
			['Tank', [t.specBrand, t.specModel].filter(Boolean).join(' ')],
			['Size', size],
			['Glass', t.glass],
			['Substrate', t.substrate],
			['Water source', t.waterSource ? SOURCES[t.waterSource] : null],
			['Grown', t.growingStyle ? GROWING_STYLE_LABEL[t.growingStyle] : null],
			['Photoperiod', t.photoperiodH != null ? `${t.photoperiodH} h` : null]
		].filter(([, v]) => v) as [string, string][],
		today,
		// the pinned note (the tank's notes), then its latest dated notes from History
		notes: t.notes,
		recentNotes: db
			.select({ id: events.id, at: events.occurredAt, note: events.note })
			.from(events)
			.where(and(is(events.tankId, t.id), is(events.category, 'note'), sql`json_extract(${events.data}, '$.system') is null`))
			.orderBy(desc(events.occurredAt))
			.limit(3)
			.all()
			.filter((n) => n.note)
			.map((n) => ({ id: n.id, day: fmtDateLong(dateInZone(n.at, user.timeZone)), text: n.note! })),
		// maintenance routines (#92): how many, for the way in beside Add dosing
		maintenanceRoutines: listRoutines(t.id).length,
		// dosing and feeding routines (#17), soonest first
		routines: listTasks(user.id, t.id)
			.filter((r) => isRoutine(r.task.kind))
			.map(({ task }) => {
				const d = dueInfo(task.due, today);
				return { id: task.id, name: task.name, line: routineLine(task), due: d.days < 0 ? d.text : d.days === 0 ? '▲ Today' : d.text.replace(/^▲ /, ''), level: d.level, now: d.days <= 0 };
			})
	};
}

export type TankDetails = ReturnType<typeof tankDetails>;
