// Maintenance routines (#92): a tank's named step sequences, in the keeper's
// order, each step a log form filled in (a Quick log favorite's shape).
import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { cleanFields, favoriteDefaultLabel, isFavoriteKind, type FavoriteKind } from '$lib/favorites';
import { MAX_STEPS, type RoutineStep } from '$lib/routines';
import { db } from './db';
import { maintenanceRoutines, type MaintenanceRoutine } from './db/schema';
import { formAmount, formUnit } from './favorites';
import { str } from './forms';
import { listTanks } from './tanks';

export function listRoutines(tankId: string): MaintenanceRoutine[] {
	return db.select().from(maintenanceRoutines).where(eq(maintenanceRoutines.tankId, tankId)).orderBy(asc(maintenanceRoutines.position), asc(maintenanceRoutines.createdAt)).all();
}

/** Every routine on the tanks this keeper can see, for Quick add and ⌘K. */
export function listRoutinesFor(userId: string): MaintenanceRoutine[] {
	const ids = listTanks(userId).map((t) => t.id);
	if (!ids.length) return [];
	return db.select().from(maintenanceRoutines).where(inArray(maintenanceRoutines.tankId, ids)).orderBy(asc(maintenanceRoutines.position), asc(maintenanceRoutines.createdAt)).all();
}

export function getRoutine(tankId: string, id: string): MaintenanceRoutine {
	const r = db.select().from(maintenanceRoutines).where(and(eq(maintenanceRoutines.id, id), eq(maintenanceRoutines.tankId, tankId))).get();
	if (!r) error(404, 'Routine not found');
	return r;
}

/** The steps as typed, only the known kinds (a row from before a kind was dropped would otherwise break the page). */
export const stepsOf = (r: MaintenanceRoutine): RoutineStep[] => r.steps.filter((s): s is RoutineStep => isFavoriteKind(s.kind));

export function addRoutine(tankId: string, name: string): MaintenanceRoutine {
	const last = listRoutines(tankId).at(-1);
	return db
		.insert(maintenanceRoutines)
		.values({ tankId, name, steps: [], position: (last?.position ?? -1) + 1 })
		.returning()
		.get();
}

export function renameRoutine(tankId: string, id: string, name: string) {
	getRoutine(tankId, id);
	db.update(maintenanceRoutines).set({ name }).where(eq(maintenanceRoutines.id, id)).run();
}

export function deleteRoutine(tankId: string, id: string): MaintenanceRoutine {
	const r = getRoutine(tankId, id);
	db.delete(maintenanceRoutines).where(eq(maintenanceRoutines.id, id)).run();
	return r;
}

/** A step from the add-step form: the kind, its fields (as a favorite's), and a name, or one from the fields. */
export function parseStep(form: FormData, volUnit: string): { errors: Record<string, string>; step: RoutineStep } {
	const errors: Record<string, string> = {};
	const kindRaw = str(form, 'kind');
	const kind: FavoriteKind = isFavoriteKind(kindRaw) ? kindRaw : 'test';
	if (!isFavoriteKind(kindRaw)) errors.kind = 'Pick what the step logs.';
	const raw = {
		amountMode: str(form, 'amountMode'),
		source: str(form, 'source'),
		product: str(form, 'product'),
		food: str(form, 'food'),
		amount: formAmount(form, kind),
		unit: formUnit(form, kind),
		actions: form.getAll('actions').map(String)
	};
	const fields = cleanFields(kind, raw);
	if (kind === 'dosing' && !fields.product) errors.product = 'Enter the product it doses.';
	if (['water_change', 'dosing', 'feeding'].includes(kind) && raw.amount && !fields.amount) errors.amount = 'Enter a number above 0, or leave it blank.';
	const label = str(form, 'label').slice(0, 60) || favoriteDefaultLabel(kind, fields, volUnit);
	return { errors, step: { kind, label, fields } };
}

function setSteps(tankId: string, id: string, steps: RoutineStep[]) {
	db.update(maintenanceRoutines).set({ steps }).where(eq(maintenanceRoutines.id, id)).run();
}

export function addStep(tankId: string, id: string, step: RoutineStep): { error: string } | null {
	const steps = stepsOf(getRoutine(tankId, id));
	if (steps.length >= MAX_STEPS) return { error: `A routine has at most ${MAX_STEPS} steps.` };
	setSteps(tankId, id, [...steps, step]);
	return null;
}

export function removeStep(tankId: string, id: string, index: number) {
	const steps = stepsOf(getRoutine(tankId, id));
	if (index < 0 || index >= steps.length) return;
	setSteps(tankId, id, steps.filter((_, i) => i !== index));
}

export function moveStep(tankId: string, id: string, index: number, dir: 'up' | 'down') {
	const steps = stepsOf(getRoutine(tankId, id));
	const j = dir === 'up' ? index - 1 : index + 1;
	if (index < 0 || index >= steps.length || j < 0 || j >= steps.length) return;
	[steps[index], steps[j]] = [steps[j], steps[index]];
	setSteps(tankId, id, steps);
}
