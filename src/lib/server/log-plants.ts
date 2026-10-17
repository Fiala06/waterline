// Plant health (#85) and algae (#86): observations with a kind, logged from
// their own pages. A plant observation also sets the plant's status (or
// removes it); an algae one is the tank's, tagged Algae like a hand-written one.
import { and, desc, eq, sql } from 'drizzle-orm';
import { isAlgaeSeverity, isAlgaeType, isPlantObservation, plantStatusAfter } from '$lib/plants';
import { db } from './db';
import { events, type Tank, type User } from './db/schema';
import { optStr, str } from './forms';
import { createEvent } from './logs';
import { listPlants, removePlant, updatePlant } from './specs';

/** A tank's plant observations, newest first; for one plant when `plantId` is given. */
export function plantHealthEvents(tankId: string, plantId?: string, limit = 50) {
	return db
		.select()
		.from(events)
		.where(
			and(
				eq(events.tankId, tankId),
				eq(events.category, 'observation'),
				sql`json_extract(${events.data}, '$.kind') = 'plant'`,
				plantId ? sql`EXISTS (SELECT 1 FROM json_each(json_extract(${events.data}, '$.plant_ids')) WHERE value = ${plantId})` : undefined
			)
		)
		// two entries in the same minute: the one logged last is the latest
		.orderBy(desc(events.occurredAt), desc(sql`${events}.rowid`))
		.limit(limit)
		.all();
}

export interface PlantHealthValues {
	plantIds: string[];
	observation: string;
	note: string;
}
export const plantHealthValues = (form: FormData): PlantHealthValues => ({
	plantIds: form.getAll('plant').map(String),
	observation: str(form, 'observation'),
	note: str(form, 'note')
});

/** Log what one or more plants are doing; each is left in the matching status, or removed. */
export function logPlantHealth(user: User, tank: Tank, form: FormData, at: string): { eventId: string; names: string[] } | { errors: Record<string, string> } {
	const v = plantHealthValues(form);
	const errors: Record<string, string> = {};
	const chosen = listPlants(user.id, tank.id).filter((p) => v.plantIds.includes(p.id));
	if (!chosen.length) errors.plants = 'Choose which plants.';
	if (!isPlantObservation(v.observation)) errors.observation = 'Say what you noticed.';
	if (Object.keys(errors).length || !isPlantObservation(v.observation)) return { errors };
	const { event } = createEvent(
		user.id,
		tank.id,
		{
			category: 'observation',
			occurredAt: at,
			note: v.note.slice(0, 4000) || null,
			data: { kind: 'plant', plant_ids: chosen.map((p) => p.id), plants: chosen.map((p) => p.name), observation: v.observation, tags: [] },
			clientId: optStr(form, 'clientId', 64)
		},
		{ timeZone: user.timeZone }
	);
	const status = plantStatusAfter(v.observation);
	for (const p of chosen) {
		if (status) updatePlant(user.id, p.id, { status });
		else removePlant(user.id, p.id, { at });
	}
	return { eventId: event.id, names: chosen.map((p) => p.name) };
}

/** Log algae on the tank: which kind, how much, where. */
export function logAlgae(user: User, tank: Tank, form: FormData, at: string): { eventId: string } | { errors: Record<string, string> } {
	const algae = str(form, 'algae');
	const severity = str(form, 'severity');
	const area = optStr(form, 'area', 80);
	const errors: Record<string, string> = {};
	if (!isAlgaeType(algae)) errors.algae = 'Pick which algae.';
	if (!isAlgaeSeverity(severity)) errors.severity = 'Say how much.';
	if (Object.keys(errors).length) return { errors };
	const { event } = createEvent(
		user.id,
		tank.id,
		{
			category: 'observation',
			occurredAt: at,
			note: optStr(form, 'note', 4000),
			data: { kind: 'algae', algae, severity, ...(area ? { area } : {}), tags: ['Algae'] },
			clientId: optStr(form, 'clientId', 64)
		},
		{ timeZone: user.timeZone }
	);
	return { eventId: event.id };
}
