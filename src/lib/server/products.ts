// Saved products: links to what the keeper buys again (conditioner, food,
// fertilizer, filter media), so reordering is one tap. Account-wide, not per
// tank; dosing shows "Reorder" for a product with a saved link.
import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { dateInZone } from '$lib/time';
import { db } from './db';
import { events, products, tanks, type Product } from './db/schema';
import { optStr, str } from './forms';

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

/** The add and edit form's fields, checked. */
export function parseProduct(form: FormData) {
	const errors: Record<string, string> = {};
	const name = str(form, 'name').slice(0, 80);
	const raw = str(form, 'url');
	const url = productUrl(raw);
	if (!name) errors.name = 'Enter the product.';
	if (!raw) errors.url = 'Paste the link you buy it from.';
	else if (!url) errors.url = "That doesn't look like a web address.";
	return { errors, input: { name, url: url ?? '', note: optStr(form, 'note', 120) } };
}

export function addProduct(userId: string, input: { name: string; url: string; note: string | null }) {
	return db
		.insert(products)
		.values({ ...input, userId })
		.returning()
		.get();
}

export function updateProduct(userId: string, id: string, input: { name: string; url: string; note: string | null }) {
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
		.where(and(eq(tanks.userId, userId), eq(events.category, 'dosing')))
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
