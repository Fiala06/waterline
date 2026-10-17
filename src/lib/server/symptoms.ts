// What the tank's own records say, for Worth checking (#95): the latest
// reading of each parameter, the last dose, the light hours and CO₂.
import { and, desc, eq } from 'drizzle-orm';
import { eventTitle } from '$lib/events';
import { fmtValue, paramUnit, statusOf } from '$lib/params';
import { statusShort } from '$lib/status';
import { tankLighting } from '$lib/equipment';
import type { SymptomFacts } from '$lib/symptoms';
import { fmtDay } from '$lib/time';
import { db } from './db';
import { events, type Tank, type User } from './db/schema';
import { latestReadings } from './logs';
import { scheduledItems } from './specs';
import { listParams } from './tanks';

/** "today", "yesterday", "Sep 28" */
const when = (at: string, tz: string) => fmtDay(at, tz).replace(/^Today$/, 'today').replace(/^Yesterday$/, 'yesterday');

export function symptomFacts(user: User, tank: Tank): SymptomFacts {
	const latest = latestReadings(tank.id);
	const params: SymptomFacts['params'] = {};
	for (const p of listParams(tank.id, { all: true })) {
		const r = latest.get(p.id);
		const unit = paramUnit(p, user);
		params[p.key] = {
			id: p.id,
			name: p.name,
			latest: r ? { value: `${fmtValue(p, r.value, user)}${unit ? ` ${unit}` : ''}`, status: statusShort(statusOf(p, r.value)), when: when(r.takenAt, user.timeZone) } : null
		};
	}
	const dose = db
		.select()
		.from(events)
		.where(and(eq(events.tankId, tank.id), eq(events.category, 'dosing')))
		.orderBy(desc(events.occurredAt))
		.limit(1)
		.get();
	const l = tankLighting(tank, scheduledItems(tank.id));
	return {
		tankId: tank.id,
		params,
		lastDose: dose ? { title: eventTitle(dose, user).replace(/^Dosed /, ''), when: when(dose.occurredAt, user.timeZone) } : null,
		lightHours: tank.withoutEquipment.includes('light') ? 'none' : (l.lights?.hours ?? null),
		co2: l.co2 ? true : tank.withoutEquipment.includes('co2') ? false : null
	};
}
