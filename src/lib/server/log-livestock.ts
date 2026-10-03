// Log event › Livestock / plants (G3) when it's linked to the tank's lists:
// "Added" adds to Livestock or Plants, "Removed" takes from them. Each
// writes its own History entry; this returns that entry so photos attach.
import { and, desc, eq, sql } from 'drizzle-orm';
import { dateInZone } from '$lib/time';
import { HEALTH_SYMPTOMS, isHealthOutcome, livestockLabel, underTreatment } from '$lib/livestock';
import { db } from './db';
import { events, type Tank, type User } from './db/schema';
import { num, optStr, str } from './forms';
import { createEvent } from './logs';
import { addLivestock, addPlant, changeCount, getLivestock, getPlant, listLivestock, removePlant, type EntryMeta } from './specs';

type Result = { eventId: string; message: string } | { errors: Record<string, string> };

export function handleLinkedLivestock(user: User, tank: Tank, form: FormData, at: string): Result | null {
	if (form.get('linked') !== '1') return null;
	const meta: EntryMeta = { at, note: optStr(form, 'note'), clientId: optStr(form, 'clientId', 64) };
	const action = str(form, 'action');
	if (action === 'added') {
		const name = str(form, 'name').slice(0, 80);
		if (!name) return { errors: { name: 'Enter the species or plant.' } };
		const kind = str(form, 'kind');
		if (kind === 'plant') {
			const position = str(form, 'position');
			const p = addPlant(user.id, tank.id, {
				name,
				scientificName: optStr(form, 'scientificName', 120),
				position: (['background', 'midground', 'foreground', 'epiphyte', 'floating'].includes(position) ? position : 'midground') as 'midground',
				status: 'thriving'
			}, meta);
			return { eventId: p.event.id, message: `✓ ${p.name} added to Plants` };
		}
		const count = num(form, 'count') ?? 1;
		if (!Number.isInteger(count) || count < 1) return { errors: { count: 'Enter a whole number.' } };
		const { row, event } = addLivestock(
			user.id,
			tank.id,
			{
				kind: kind === 'invert' || kind === 'coral' ? kind : 'fish',
				commonName: name,
				scientificName: optStr(form, 'scientificName', 120),
				count,
				status: str(form, 'status') === 'quarantine' ? 'quarantine' : 'in_tank',
				addedAt: dateInZone(at, user.timeZone),
				source: null
			},
			meta
		);
		return { eventId: event.id, message: `✓ Added ${count} ${row.commonName}` };
	}

	if (action === 'removed' || action === 'moved') {
		const [type, id] = str(form, 'target').split(':');
		if (!id) return { errors: { target: 'Choose which one.' } };
		if (type === 'plant') {
			const p = getPlant(user.id, id);
			if (p.tankId !== tank.id) return { errors: { target: 'Choose which one.' } };
			if (action === 'moved') {
				form.set('name', p.name); // "Moved" is saved as a plain event, which needs the name
				return null;
			}
			const r = removePlant(user.id, id, meta);
			return { eventId: r.event.id, message: `${r.name} removed from Plants` };
		}
		const l = getLivestock(user.id, id);
		if (l.tankId !== tank.id) return { errors: { target: 'Choose which one.' } };
		if (action === 'moved') {
			form.set('name', l.commonName);
			return null;
		}
		const n = num(form, 'count') ?? 1;
		if (!Number.isInteger(n) || n < 1 || n > l.count) return { errors: { count: `Enter 1 to ${l.count}.` } };
		const reason = str(form, 'reason') === 'rehomed' ? 'rehomed' : 'loss';
		const r = changeCount(user.id, id, l.count - n, reason, meta);
		return { eventId: r.event?.id ?? '', message: l.nickname ? `✓ ${livestockLabel(l)} removed` : `✓ ${l.commonName} ${l.count} → ${l.count - n}` };
	}
	return null;
}

// ── Health ────────────────────────────────────────────────────────────────

/** A tank's health entries, newest first; for one animal when `livestockId` is given. */
export function healthEvents(tankId: string, livestockId?: string, limit = 50) {
	return db
		.select()
		.from(events)
		.where(
			and(
				eq(events.tankId, tankId),
				eq(events.category, 'health'),
				livestockId ? sql`EXISTS (SELECT 1 FROM json_each(json_extract(${events.data}, '$.livestockIds')) WHERE value = ${livestockId})` : undefined
			)
		)
		.orderBy(desc(events.occurredAt), desc(events.id))
		.limit(limit)
		.all();
}

/** The animals in a tank whose latest health entry is still watching or treating. */
export const underTreatmentIn = (tankId: string) => underTreatment(healthEvents(tankId, undefined, 200));

export interface HealthValues {
	livestockIds: string[];
	symptoms: string[];
	treatment: string;
	outcome: string;
	note: string;
	reduce: boolean;
}

export const healthValues = (form: FormData): HealthValues => ({
	livestockIds: form.getAll('livestock').map(String),
	symptoms: form.getAll('symptom').map(String),
	treatment: str(form, 'treatment'),
	outcome: str(form, 'outcome'),
	note: str(form, 'note'),
	reduce: form.get('reduce') === '1'
});

/**
 * Log a health entry (an event with category 'health') for one or more of the
 * tank's animals. A loss of one animal can also take 1 off its count, which
 * logs its own livestock entry with reason loss.
 */
export function logHealth(user: User, tank: Tank, form: FormData, at: string): { eventId: string; treatment: string | null } | { errors: Record<string, string> } {
	const v = healthValues(form);
	const errors: Record<string, string> = {};
	const inTank = listLivestock(user.id, tank.id);
	const chosen = inTank.filter((l) => v.livestockIds.includes(l.id));
	if (!chosen.length) errors.livestock = 'Choose which animals.';
	const symptoms = HEALTH_SYMPTOMS.filter((s) => v.symptoms.includes(s));
	if (!symptoms.length) errors.symptoms = 'Pick at least one symptom.';
	if (!isHealthOutcome(v.outcome)) errors.outcome = 'Say how it stands.';
	if (Object.keys(errors).length || !isHealthOutcome(v.outcome)) return { errors };
	const treatment = v.treatment.slice(0, 120) || null;
	const { event } = createEvent(
		user.id,
		tank.id,
		{
			category: 'health',
			occurredAt: at,
			note: v.note.slice(0, 4000) || null,
			data: { livestockIds: chosen.map((l) => l.id), names: chosen.map(livestockLabel), symptoms, treatment, outcome: v.outcome },
			clientId: optStr(form, 'clientId', 64)
		},
		{ timeZone: user.timeZone }
	);
	// lost one animal: one fewer in the tank
	if (v.outcome === 'lost' && v.reduce && chosen.length === 1 && chosen[0].count >= 1) changeCount(user.id, chosen[0].id, chosen[0].count - 1, 'loss', { at });
	return { eventId: event.id, treatment };
}
