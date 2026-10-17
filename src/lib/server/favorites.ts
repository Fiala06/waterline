// Quick log favorites (#93): pinned entries on Quick add, one tap to a log
// form filled in. The keeper's own, for one tank or every tank; kept in the
// order they put them.
import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { cleanFields, favoriteDefaultLabel, isFavoriteKind, type FavoriteFields, type FavoriteKind } from '$lib/favorites';
import { db } from './db';
import { quickFavorites, type QuickFavorite } from './db/schema';
import { str } from './forms';

export function listFavorites(userId: string): QuickFavorite[] {
	return db
		.select()
		.from(quickFavorites)
		.where(eq(quickFavorites.userId, userId))
		.orderBy(asc(quickFavorites.position), asc(quickFavorites.createdAt))
		.all();
}

export function getFavorite(userId: string, id: string): QuickFavorite {
	const f = db.select().from(quickFavorites).where(and(eq(quickFavorites.id, id), eq(quickFavorites.userId, userId))).get();
	if (!f) error(404, 'Favorite not found');
	return f;
}

/**
 * The form has an amount and a unit field per kind (every kind's fields are in
 * it, the others hidden by CSS, and hidden fields post too), so each has its
 * own name: wcAmount, doseAmount · doseUnit, feedAmount · feedUnit.
 */
export const formAmount = (form: FormData, kind: FavoriteKind) =>
	str(form, kind === 'water_change' ? 'wcAmount' : kind === 'dosing' ? 'doseAmount' : 'feedAmount');
export const formUnit = (form: FormData, kind: FavoriteKind) => str(form, kind === 'dosing' ? 'doseUnit' : 'feedUnit');

export interface FavoriteInput {
	label: string;
	tankId: string | null;
	kind: FavoriteKind;
	fields: FavoriteFields;
}

/**
 * The add and edit form's fields, checked: the kind must be one of the six,
 * the tank one of the keeper's (or every tank), a dose needs its product, and
 * a blank name gets one from the fields ("40% water change").
 */
export function parseFavorite(form: FormData, tankIds: string[], volUnit: string): { errors: Record<string, string>; input: FavoriteInput } {
	const errors: Record<string, string> = {};
	const kindRaw = str(form, 'kind');
	const kind: FavoriteKind = isFavoriteKind(kindRaw) ? kindRaw : 'test';
	if (!isFavoriteKind(kindRaw)) errors.kind = 'Pick what it logs.';
	const tankRaw = str(form, 'tank');
	const tankId = tankRaw && tankIds.includes(tankRaw) ? tankRaw : null;
	if (tankRaw && !tankId) errors.tank = 'Pick one of your tanks, or every tank.';
	const raw: Record<string, unknown> = {
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
	return { errors, input: { label, tankId, kind, fields } };
}

export function addFavorite(userId: string, input: FavoriteInput): QuickFavorite {
	const last = listFavorites(userId).at(-1);
	return db
		.insert(quickFavorites)
		.values({ userId, ...input, position: (last?.position ?? -1) + 1 })
		.returning()
		.get();
}

export function updateFavorite(userId: string, id: string, input: FavoriteInput): QuickFavorite {
	getFavorite(userId, id);
	return db.update(quickFavorites).set(input).where(eq(quickFavorites.id, id)).returning().get();
}

export function deleteFavorite(userId: string, id: string): QuickFavorite {
	const f = getFavorite(userId, id);
	db.delete(quickFavorites).where(eq(quickFavorites.id, id)).run();
	return f;
}

/** Move one up or down the list; the positions are renumbered 0… so they stay dense. */
export function moveFavorite(userId: string, id: string, dir: 'up' | 'down') {
	const list = listFavorites(userId);
	const i = list.findIndex((f) => f.id === id);
	if (i < 0) error(404, 'Favorite not found');
	const j = dir === 'up' ? i - 1 : i + 1;
	if (j < 0 || j >= list.length) return;
	[list[i], list[j]] = [list[j], list[i]];
	db.transaction((tx) => {
		list.forEach((f, position) => tx.update(quickFavorites).set({ position }).where(eq(quickFavorites.id, f.id)).run());
	});
}
