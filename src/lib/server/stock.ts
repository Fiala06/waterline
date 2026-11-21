// Stock (#318): what's left in a saved product's bottle, in mL. The keeper
// measures it (there's this much now) and logs refills; doses logged in mL
// under the product's exact name, in their own tanks, since the latest
// measurement are taken off to estimate what's left. Worked out when it's read,
// from the log itself, so a dose edited, deleted or replayed counts once, and a
// routine's Done (which logs the dose) isn't counted apart from the dose.
// Other units (g, drops, capfuls) aren't taken off: they can't be compared.
import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from './db';
import { events, productStock, products, tanks, type Product, type ProductStock } from './db/schema';
import { getProduct } from './products';
import { stockKey, type StockAlert } from '$lib/alerts';
import { formatNumber } from '$lib/units';

export interface StockStatus {
	productId: string;
	/** the latest measurement */
	measured: { ml: number; at: string };
	/** mL added by refills since */
	refilled: number;
	/** doses taken off since: how many, and how much */
	doses: { count: number; ml: number };
	/** what's left: measured + refilled − doses, never below 0 */
	left: number;
	/** taken off from logged doses, so an estimate, not a measurement */
	estimated: boolean;
	low: boolean;
	/** what changes the alert's key: the latest measurement or refill */
	since: string;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** Each tracked product's stock, for one keeper (or just these products). */
export function stockFor(userId: string, only?: Product[]): Map<string, StockStatus> {
	const list = only ?? db.select().from(products).where(eq(products.userId, userId)).all();
	const out = new Map<string, StockStatus>();
	if (!list.length) return out;
	const rows = db
		.select()
		.from(productStock)
		.where(inArray(productStock.productId, list.map((p) => p.id)))
		.orderBy(asc(productStock.at), asc(productStock.createdAt))
		.all();
	const byProduct = Map.groupBy(rows, (r) => r.productId);
	const tracked = list.filter((p) => byProduct.get(p.id)?.some((r) => r.kind === 'set'));
	if (!tracked.length) return out;
	// the measurement each starts from, and the doses since the earliest of them, from the keeper's own tanks
	const start = new Map(tracked.map((p) => [p.id, byProduct.get(p.id)!.filter((r) => r.kind === 'set').at(-1)!]));
	const earliest = [...start.values()].map((r) => r.at).sort()[0];
	const doses = db
		.select({ data: events.data, at: events.occurredAt })
		.from(events)
		.innerJoin(tanks, eq(tanks.id, events.tankId))
		.where(and(eq(tanks.userId, userId), eq(events.category, 'dosing'), gt(events.occurredAt, earliest)))
		.all();
	for (const p of tracked) {
		const set = start.get(p.id)!;
		const refills = byProduct.get(p.id)!.filter((r) => r.kind === 'refill' && r.at > set.at);
		const mine = doses.filter((d) => d.at > set.at && norm(d.data.product) === norm(p.name) && norm(d.data.unit || 'mL') === 'ml' && typeof d.data.amount === 'number' && d.data.amount > 0);
		const used = mine.reduce((n, d) => n + (d.data.amount as number), 0);
		const refilled = refills.reduce((n, r) => n + r.ml, 0);
		const left = Math.max(0, set.ml + refilled - used);
		out.set(p.id, {
			productId: p.id,
			measured: { ml: set.ml, at: set.at },
			refilled,
			doses: { count: mine.length, ml: used },
			left,
			estimated: mine.length > 0,
			low: p.lowMl != null && left <= p.lowMl,
			since: refills.at(-1)?.at ?? set.at
		});
	}
	return out;
}

/** A product's stock log, newest first. */
export function stockLog(userId: string, productId: string): ProductStock[] {
	getProduct(userId, productId);
	return db.select().from(productStock).where(eq(productStock.productId, productId)).orderBy(desc(productStock.at), desc(productStock.createdAt)).all();
}

const MAX_ML = 1_000_000;
function amount(ml: number) {
	if (!Number.isFinite(ml) || ml < 0 || ml > MAX_ML) error(400, 'Enter an amount in mL.');
	return Math.round(ml * 100) / 100;
}

/** There's this much now: the measurement what's left counts from. */
export function measureStock(userId: string, productId: string, ml: number, note: string | null = null, at = new Date().toISOString()) {
	getProduct(userId, productId);
	return db.insert(productStock).values({ productId, at, kind: 'set', ml: amount(ml), note }).returning().get();
}

/** This much more, added to what's left. */
export function refillStock(userId: string, productId: string, ml: number, note: string | null = null, at = new Date().toISOString()) {
	getProduct(userId, productId);
	if (!db.select().from(productStock).where(and(eq(productStock.productId, productId), eq(productStock.kind, 'set'))).get())
		error(400, 'Say how much there is first.');
	if (ml <= 0) error(400, 'Enter how much you added.');
	return db.insert(productStock).values({ productId, at, kind: 'refill', ml: amount(ml), note }).returning().get();
}

/** The low mark and whether it's an alert (off unless turned on). */
export function setLowStock(userId: string, productId: string, lowMl: number | null, alert: boolean) {
	getProduct(userId, productId);
	db.update(products).set({ lowMl: lowMl == null ? null : amount(lowMl), lowAlert: alert && lowMl != null }).where(eq(products.id, productId)).run();
}

/** Take one entry out of the log. */
export function deleteStockEntry(userId: string, productId: string, entryId: string) {
	getProduct(userId, productId);
	db.delete(productStock).where(and(eq(productStock.id, entryId), eq(productStock.productId, productId))).run();
}

/** Stop tracking: the log goes, and the alert with it. */
export function stopStock(userId: string, productId: string) {
	getProduct(userId, productId);
	db.transaction((tx) => {
		tx.delete(productStock).where(eq(productStock.productId, productId)).run();
		tx.update(products).set({ lowAlert: false }).where(eq(products.id, productId)).run();
	});
}

/** The keeper's products running low with their alert on (#318), for the bell and Alerts. */
export function stockAlerts(userId: string): StockAlert[] {
	const watched = db.select().from(products).where(and(eq(products.userId, userId), eq(products.lowAlert, true))).all();
	if (!watched.length) return [];
	const stock = stockFor(userId, watched);
	return watched.flatMap((p) => {
		const s = stock.get(p.id);
		if (!s?.low) return [];
		const left = `${s.estimated ? 'About ' : ''}${formatNumber(s.left, 0)} mL left`;
		return [{ kind: 'stock' as const, key: stockKey(p.id, s.since), tankId: null, tankName: 'Supplies', productId: p.id, title: `${p.name} is running low`, sub: `${left} · below ${formatNumber(p.lowMl!, 0)} mL`, href: `/settings/products/${p.id}/stock` }];
	});
}
