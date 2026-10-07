// The wish list (#24): what the keeper plans to add to a tank, and Add to
// tank, which puts it in Livestock, Plants or Equipment with the usual History
// entry, and can log the purchase in Spending.
import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { EQUIPMENT_TYPES, type EquipmentType } from '$lib/equipment';
import { validLivestockCount } from '$lib/livestock';
import { parseMoney } from '$lib/money';
import { todayInZone } from '$lib/time';
import { db } from './db';
import { WISH_KINDS, wishes, type User, type Wish, type WishKind } from './db/schema';
import { addExpense } from './expenses';
import { num, optStr, str } from './forms';
import { productUrl } from './products';
import { addEquipment, addLivestock, addPlant } from './specs';
import { getTank } from './tanks';

export function listWishes(userId: string, tankId: string, opts: { added?: boolean } = {}): Wish[] {
	getTank(userId, tankId);
	return db
		.select()
		.from(wishes)
		.where(and(eq(wishes.tankId, tankId), opts.added ? isNotNull(wishes.addedAt) : isNull(wishes.addedAt)))
		.orderBy(opts.added ? desc(wishes.addedAt) : asc(wishes.createdAt))
		.all();
}

export function getWish(userId: string, tankId: string, id: string): Wish {
	getTank(userId, tankId);
	const w = db.select().from(wishes).where(and(eq(wishes.id, id), eq(wishes.tankId, tankId))).get();
	if (!w) error(404, 'Not on the wish list');
	return w;
}

export interface WishInput {
	kind: WishKind;
	name: string;
	scientificName: string | null;
	count: number;
	equipmentType: EquipmentType | null;
	note: string | null;
	priceCents: number | null;
	url: string | null;
}

/** The form, checked: the wish, or what to fix. */
export function parseWish(form: FormData): { errors: Record<string, string>; input: WishInput; values: Record<string, string> } {
	const errors: Record<string, string> = {};
	const kind = str(form, 'kind') as WishKind;
	const name = str(form, 'name').slice(0, 80);
	const count = num(form, 'count') ?? 1;
	const price = str(form, 'price');
	const priceCents = price ? parseMoney(price) : null;
	const rawUrl = str(form, 'url');
	const url = rawUrl ? productUrl(rawUrl) : null;
	const equipmentType = str(form, 'equipmentType') as EquipmentType;
	if (!WISH_KINDS.includes(kind)) errors.kind = 'Pick what it is.';
	if (!name) errors.name = kind === 'equipment' ? 'Name the item, e.g. Fluval 307.' : 'Enter the species.';
	if (!validLivestockCount(count)) errors.count = 'Enter a whole number from 1 to 10,000.';
	if (price && priceCents == null) errors.price = 'Enter a price, like 12.50.';
	if (rawUrl && !url) errors.url = "That doesn't look like a web address.";
	if (kind === 'equipment' && !EQUIPMENT_TYPES.includes(equipmentType)) errors.equipmentType = 'Pick the kind of equipment.';
	return {
		errors,
		values: { kind, name, scientificName: str(form, 'scientificName'), count: String(count), price, url: rawUrl, note: str(form, 'note'), equipmentType },
		input: {
			kind,
			name,
			scientificName: kind === 'equipment' ? null : optStr(form, 'scientificName', 120),
			count: kind === 'plant' || kind === 'equipment' ? 1 : count,
			equipmentType: kind === 'equipment' ? equipmentType : null,
			note: optStr(form, 'note', 300),
			priceCents,
			url
		}
	};
}

export function addWish(userId: string, tankId: string, input: WishInput): Wish {
	getTank(userId, tankId, 'owner');
	return db.insert(wishes).values({ ...input, tankId }).returning().get();
}

/** Rows taken off the list, kept a few minutes for the toast's Undo. */
const recentlyDeleted = new Map<string, { w: Wish; at: number }>();
const UNDO_MS = 10 * 60_000;

export function deleteWish(userId: string, tankId: string, id: string): Wish {
	getTank(userId, tankId, 'owner');
	const w = getWish(userId, tankId, id);
	db.delete(wishes).where(eq(wishes.id, id)).run();
	for (const [k, v] of recentlyDeleted) if (Date.now() - v.at > UNDO_MS) recentlyDeleted.delete(k);
	recentlyDeleted.set(w.id, { w, at: Date.now() });
	return w;
}

/** Undo of a delete: the same row back, while it's still remembered. */
export function restoreWish(userId: string, tankId: string, id: string): Wish | null {
	getTank(userId, tankId, 'owner');
	const kept = recentlyDeleted.get(id);
	if (!kept || kept.w.tankId !== tankId) return null;
	recentlyDeleted.delete(id);
	return db.insert(wishes).values(kept.w).returning().get();
}

/**
 * Add to tank: the wish becomes livestock, a plant or equipment, with the
 * usual History entry, and with `spend` the purchase goes in Spending at the
 * wish's price (or the amount given). The wish stays, marked added.
 */
export function addWishToTank(user: User, tankId: string, id: string, opts: { spend: boolean; amountCents?: number | null }) {
	// the wish list is the owner's, like adding and deleting wishes (#106); checked before anything is added
	getTank(user.id, tankId, 'owner');
	const w = getWish(user.id, tankId, id);
	if (w.addedAt) error(400, 'Already added.');
	const today = todayInZone(user.timeZone);
	let added: string;
	if (w.kind === 'equipment') {
		const e = addEquipment(user.id, tankId, { type: w.equipmentType ?? 'other', brand: null, model: w.name, specs: {}, installedAt: today, notes: w.note }, user.timeZone);
		added = `${e.model ?? w.name} added to Equipment`;
	} else if (w.kind === 'plant') {
		addPlant(user.id, tankId, { name: w.name, scientificName: w.scientificName, position: 'midground', status: 'thriving' });
		added = `${w.name} added to Plants`;
	} else {
		const { row } = addLivestock(user.id, tankId, { kind: w.kind, commonName: w.name, scientificName: w.scientificName, count: w.count, status: 'in_tank', addedAt: today, source: null });
		added = `${w.count} ${row.commonName} added to Livestock`;
	}
	const cents = opts.amountCents ?? w.priceCents;
	let spent = false;
	if (opts.spend && cents != null && cents > 0) {
		addExpense(user.id, tankId, {
			date: today,
			amountCents: cents,
			category: w.kind === 'equipment' ? 'equipment' : w.kind === 'plant' ? 'plants' : 'livestock',
			what: w.kind === 'equipment' || w.kind === 'plant' ? w.name : `${w.count} ${w.name}`,
			note: null
		});
		spent = true;
	}
	db.update(wishes).set({ addedAt: new Date().toISOString() }).where(eq(wishes.id, w.id)).run();
	return { wish: w, message: `✓ ${added}${spent ? ' · logged in Spending' : ''}` };
}

/** "3 planned · about $62", for the tabs and the header. */
export function wishTotals(items: Wish[]) {
	const priced = items.filter((w) => w.priceCents != null);
	return { count: items.length, cents: priced.reduce((n, w) => n + (w.priceCents ?? 0), 0), priced: priced.length };
}
