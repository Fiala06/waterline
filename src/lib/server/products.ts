// Saved products: links to what the keeper buys again (conditioner, food,
// fertilizer, filter media), so reordering is one tap. Account-wide, not per
// tank; dosing shows "Reorder" for a product with a saved link.
import { error } from '@sveltejs/kit';
import { visibleTo } from './members';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { dateInZone } from '$lib/time';
import { db } from './db';
import { events, products, tanks, type Product } from './db/schema';
import { strengthMgPerMl } from '$lib/calculators';
import { toStored, type UnitPrefs } from '$lib/units';
import { num, optStr, str } from './forms';

/**
 * A link as typed ("amazon.com/dp/…" or a full address), as an https or http
 * URL; null for anything else, so a saved link can never run script.
 */
export function productUrl(raw: string): string | null {
	const s = raw.trim();
	if (!s || /\s/.test(s)) return null;
	const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s.replace(/^\/+/, '')}`;
	try {
		const u = new URL(withScheme);
		if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
		if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
		return u.href.length <= 2000 ? u.href : null;
	} catch {
		return null;
	}
}

/** "amazon.com" for the list, without "www." */
export const productHost = (url: string) => new URL(url).hostname.replace(/^www\./, '');

export function listProducts(userId: string): Product[] {
	return db
		.select()
		.from(products)
		.where(eq(products.userId, userId))
		.orderBy(asc(sql`lower(${products.name})`))
		.all();
}

export function getProduct(userId: string, id: string): Product {
	const p = db.select().from(products).where(and(eq(products.id, id), eq(products.userId, userId))).get();
	if (!p) error(404, 'Product not found');
	return p;
}

export interface ProductInput {
	name: string;
	url: string;
	note: string | null;
	strengthMgPerMl: number | null;
	strengthOf: string | null;
}

/**
 * The add and edit form's fields, checked. The strength (#18) is optional and
 * read as a bottle states it: "`strengthDose` mL in `strengthPer` (keeper's
 * volume unit) adds `strengthPpm` ppm of `strengthOf`".
 */
export function parseProduct(form: FormData, prefs: UnitPrefs): { errors: Record<string, string>; input: ProductInput } {
	const errors: Record<string, string> = {};
	const name = str(form, 'name').slice(0, 80);
	const raw = str(form, 'url');
	const url = productUrl(raw);
	if (!name) errors.name = 'Enter the product.';
	if (!raw) errors.url = 'Paste the link you buy it from.';
	else if (!url) errors.url = "That doesn't look like a web address.";
	const dose = num(form, 'strengthDose');
	const per = num(form, 'strengthPer');
	const ppm = num(form, 'strengthPpm');
	const of = optStr(form, 'strengthOf', 40);
	let strength: number | null = null;
	if (dose != null || per != null || ppm != null) {
		strength = dose != null && per != null && ppm != null ? strengthMgPerMl(dose, toStored(per, 'volume', prefs), ppm) : null;
		if (strength == null) errors.strength = 'Fill in all three: the dose, the volume and the ppm it adds.';
	}
	return { errors, input: { name, url: url ?? '', note: optStr(form, 'note', 120), strengthMgPerMl: strength, strengthOf: strength != null ? of : null } };
}

export function addProduct(userId: string, input: ProductInput) {
	return db
		.insert(products)
		.values({ ...input, userId })
		.returning()
		.get();
}

export function updateProduct(userId: string, id: string, input: ProductInput) {
	getProduct(userId, id);
	return db.update(products).set(input).where(eq(products.id, id)).returning().get();
}

export function deleteProduct(userId: string, id: string) {
	const p = getProduct(userId, id);
	db.delete(products).where(eq(products.id, id)).run();
	return p;
}

/** When each product was last dosed, by lowercase name: "Last dosed Sep 20 in Riverbed 40". */
export function lastDosed(userId: string, timeZone: string) {
	const rows = db
		.select({ data: events.data, at: events.occurredAt, tank: tanks.name })
		.from(events)
		.innerJoin(tanks, eq(tanks.id, events.tankId))
		.where(and(visibleTo(userId), eq(events.category, 'dosing')))
		.orderBy(desc(events.occurredAt))
		.limit(500)
		.all();
	const last = new Map<string, { name: string; date: string; tank: string }>();
	for (const r of rows) {
		const name = String(r.data.product ?? '').trim();
		const key = name.toLowerCase();
		if (name && !last.has(key)) last.set(key, { name, date: dateInZone(r.at, timeZone), tank: r.tank });
	}
	return last;
}
