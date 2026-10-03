// Test kits (#21): saved per account, looked up by parameter on the water test form.
import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { KIT_PARAMS, MAX_STEPS, parseSteps, type KitStep } from '$lib/kits';
import { db } from './db';
import { testKits, type TestKit } from './db/schema';
import { str } from './forms';

export function listKits(userId: string): TestKit[] {
	return db.select().from(testKits).where(eq(testKits.userId, userId)).orderBy(asc(testKits.createdAt)).all();
}

export function getKit(userId: string, id: string): TestKit {
	const k = db.select().from(testKits).where(and(eq(testKits.id, id), eq(testKits.userId, userId))).get();
	if (!k) error(404, 'Kit not found');
	return k;
}

/** The kit for each parameter key this person has one for (the newest wins when there are two). */
export function kitsByParam(userId: string): Record<string, { id: string; name: string; steps: KitStep[] }> {
	const out: Record<string, { id: string; name: string; steps: KitStep[] }> = {};
	for (const k of listKits(userId)) out[k.paramKey] = { id: k.id, name: k.name, steps: k.steps };
	return out;
}

const validKey = (k: string) => KIT_PARAMS.some((p) => p.key === k) || /^custom:[^\s].{0,60}$/.test(k);

/** The add and edit form: a name, the parameter it's for and its steps, one per line. */
export function parseKit(form: FormData) {
	const errors: Record<string, string> = {};
	const name = str(form, 'name').slice(0, 80);
	const paramKey = str(form, 'paramKey') === 'custom' ? `custom:${str(form, 'customName').toLowerCase().slice(0, 60)}` : str(form, 'paramKey');
	const steps = parseSteps(String(form.get('steps') ?? ''));
	if (!name) errors.name = 'Name the kit.';
	if (!validKey(paramKey) || paramKey === 'custom:') errors.paramKey = 'Pick the parameter it tests.';
	if (!steps.length) errors.steps = 'Write the steps, one per line.';
	else if (String(form.get('steps') ?? '').split('\n').filter((l) => l.trim()).length > MAX_STEPS) errors.steps = `Up to ${MAX_STEPS} steps.`;
	return { errors, input: { name, paramKey, steps } };
}

export function addKit(userId: string, input: { name: string; paramKey: string; steps: KitStep[] }) {
	return db.insert(testKits).values({ ...input, userId }).returning().get();
}

export function updateKit(userId: string, id: string, input: { name: string; paramKey: string; steps: KitStep[] }) {
	getKit(userId, id);
	return db.update(testKits).set(input).where(eq(testKits.id, id)).returning().get();
}

export function deleteKit(userId: string, id: string) {
	const k = getKit(userId, id);
	db.delete(testKits).where(eq(testKits.id, id)).run();
	return k;
}
