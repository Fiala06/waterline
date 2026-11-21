// Spending (#7): what's spent on a tank, its totals, and a receipt for each
// (#8), a photo (resized, without its metadata) or a PDF, kept in
// DATA_DIR/receipts and shown only to its owner.
import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { equipmentName } from '$lib/equipment';
import { safeCell } from '$lib/csv';
import { mainCurrency, sumByCurrency, type Sums } from '$lib/money';
import { addDays } from '$lib/time';
import { db } from './db';
import { requireRoleOn, visibleTo } from './members';
import { equipment, expenses, tanks, type Expense } from './db/schema';
import { removeFiles, writeThen } from './files';
import { dataDir } from './instance';
import { getTank } from './tanks';

export type ExpenseCategory = Expense['category'];
export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
	livestock: 'Livestock',
	plants: 'Plants',
	equipment: 'Equipment',
	consumables: 'Consumables',
	other: 'Other'
};

export interface ExpenseInput {
	date: string;
	amountCents: number;
	category: ExpenseCategory;
	what: string;
	note: string | null;
	productId?: string | null;
	/** the equipment item it was for (#148) */
	equipmentId?: string | null;
}

export function listExpenses(userId: string, tankId: string) {
	getTank(userId, tankId);
	return db.select().from(expenses).where(eq(expenses.tankId, tankId)).orderBy(desc(expenses.date), desc(expenses.createdAt)).all();
}

/** What an item cost (#148): the expenses linked to it, newest first, with their sum per currency (#307). */
export function expensesForEquipment(equipmentId: string) {
	// two added in the same millisecond: the one added last is the newest
	const rows = db
		.select()
		.from(expenses)
		.where(eq(expenses.equipmentId, equipmentId))
		.orderBy(desc(expenses.date), desc(expenses.createdAt), desc(sql`${expenses}.rowid`))
		.all();
	return { rows, totals: sumByCurrency(rows.map((e) => ({ cents: e.amountCents, currency: e.currency }))) };
}

/** The name of each equipment item of these tanks, past ones too, to say what an expense was for. */
export function equipmentNames(tankIds: string[]): Map<string, string> {
	if (!tankIds.length) return new Map();
	return new Map(db.select().from(equipment).where(inArray(equipment.tankId, tankIds)).all().map((e) => [e.id, equipmentName(e)]));
}

/** The items an expense can be for, per tank: the ones in the tank first, then past ones. */
export function equipmentChoices(tankIds: string[]): Record<string, { id: string; name: string; past: boolean }[]> {
	const out: Record<string, { id: string; name: string; past: boolean }[]> = Object.fromEntries(tankIds.map((id) => [id, []]));
	if (!tankIds.length) return out;
	for (const e of db.select().from(equipment).where(inArray(equipment.tankId, tankIds)).orderBy(asc(equipment.createdAt)).all())
		out[e.tankId]?.push({ id: e.id, name: equipmentName(e), past: !!e.removedAt });
	for (const list of Object.values(out)) list.sort((a, b) => Number(a.past) - Number(b.past));
	return out;
}

export function getExpense(userId: string, id: string): Expense {
	const row = db
		.select({ e: expenses })
		.from(expenses)
		.innerJoin(tanks, eq(tanks.id, expenses.tankId))
		.where(and(eq(expenses.id, id), visibleTo(userId)))
		.get();
	if (!row) error(404, 'Expense not found');
	return row.e;
}

/** A new expense, in `currency`: the keeper's preference as it is now (#307). */
export function addExpense(userId: string, tankId: string, input: ExpenseInput & { currency: string }, importId: string | null = null) {
	getTank(userId, tankId, 'owner');
	return db.insert(expenses).values({ ...input, tankId, importId }).returning().get();
}

/** An expense's details; it keeps its currency (#307), and moving it to another of the keeper's tanks keeps its receipt. */
export async function updateExpense(userId: string, id: string, input: ExpenseInput & { tankId: string }) {
	const before = getExpense(userId, id);
	// the owner's, on the tank it's on and the one it goes to (#106)
	requireRoleOn(userId, before.tankId, 'owner');
	getTank(userId, input.tankId, 'owner');
	const save = (receiptPath: string | null) => db.update(expenses).set({ ...input, currency: before.currency, receiptPath }).where(eq(expenses.id, id)).returning().get();
	if (!before.receiptPath || input.tankId === before.tankId) return save(before.receiptPath);
	// to another tank: a copy in its folder, the row, then the old file (#118)
	let data: Buffer;
	try {
		data = await readFile(fullPath(before.receiptPath));
	} catch {
		// the file was already gone: the expense moves without it
		return save(null);
	}
	const moved = receiptFile(input.tankId, before.id, before.receiptType!);
	const row = await writeThen([[fullPath(moved), data]], () => save(moved));
	await removeFiles([fullPath(before.receiptPath)], 'server');
	return row;
}

export async function deleteExpense(userId: string, id: string) {
	const e = getExpense(userId, id);
	requireRoleOn(userId, e.tankId, 'owner');
	db.delete(expenses).where(eq(expenses.id, id)).run();
	if (e.receiptPath) await removeFiles([fullPath(e.receiptPath)], 'server');
	return e;
}

// ── Totals ──────────────────────────────────────────────────────────────────

const MONTHS = 12;

/** "Sep 2026" for "2026-09" */
const monthLabel = (m: string) =>
	new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * This month, this year and all time; this year by category; and each of the
 * last 12 months, oldest first (months with nothing spent included, as 0).
 * Each total is per currency (#307); `cents` (bar heights, shares, order) is
 * in the main one, `mainCurrency`.
 */
export function spendingSummary(rows: Pick<Expense, 'date' | 'amountCents' | 'category' | 'currency'>[], today: string, preferred = 'USD') {
	const month = today.slice(0, 7);
	const year = today.slice(0, 4);
	const main = mainCurrency(rows.map((e) => e.currency), preferred);
	const sums = (xs: typeof rows): Sums => sumByCurrency(xs.map((e) => ({ cents: e.amountCents, currency: e.currency })));
	const cents = (xs: typeof rows) => xs.reduce((n, e) => n + (e.currency === main ? e.amountCents : 0), 0);
	const thisYear = rows.filter((e) => e.date.startsWith(year));
	const byCategory = Object.entries(CATEGORY_LABEL)
		.map(([key, label]) => {
			const xs = thisYear.filter((e) => e.category === key);
			return { key: key as ExpenseCategory, label, sums: sums(xs), cents: cents(xs), count: xs.length };
		})
		.filter((c) => c.count > 0)
		.sort((a, b) => b.cents - a.cents)
		.map(({ count: _, ...c }) => c);
	const months: { key: string; label: string; sums: Sums; cents: number }[] = [];
	let d = `${month}-01`;
	for (let i = 0; i < MONTHS; i++) {
		const key = d.slice(0, 7);
		const xs = rows.filter((e) => e.date.startsWith(key));
		months.unshift({ key, label: monthLabel(key), sums: sums(xs), cents: cents(xs) });
		d = addDays(d, -1).slice(0, 7) + '-01'; // the month before
	}
	return { main, month: sums(rows.filter((e) => e.date.startsWith(month))), year: sums(thisYear), yearCents: cents(thisYear), all: sums(rows), byCategory, months };
}

/** This year's spending on all of the keeper's tanks (archived ones too), per currency (#307). */
export function spentThisYear(userId: string, year: string): Sums {
	const ids = db.select({ id: tanks.id }).from(tanks).where(eq(tanks.userId, userId)).all().map((t) => t.id);
	if (!ids.length) return {};
	return sumByCurrency(
		db
			.select({ cents: expenses.amountCents, currency: expenses.currency, date: expenses.date })
			.from(expenses)
			.where(inArray(expenses.tankId, ids))
			.all()
			.filter((e) => e.date.startsWith(year))
	);
}

// ── CSV (#314) ──────────────────────────────────────────────────────────────

/**
 * Expenses as a spreadsheet: one row each, the amount in its own currency
 * (never converted), with its tank, the item it was for, and whether it has a
 * receipt (never where the file is). Cells are guarded against formulas.
 */
export function expensesCsv(rows: Expense[], tankNames: Map<string, string>, items: Map<string, string>): string {
	const head = ['Date', 'Amount', 'Currency', 'Category', 'What for', 'Item', 'Note', 'Tank', 'Receipt'];
	// safeCell guards and quotes each cell, so the lines are joined here rather than by toCsv
	const lines = [
		head,
		...rows.map((e) =>
			[
				e.date,
				(e.amountCents / 100).toFixed(2),
				e.currency,
				CATEGORY_LABEL[e.category],
				e.what,
				(e.equipmentId && items.get(e.equipmentId)) || '',
				e.note ?? '',
				tankNames.get(e.tankId) ?? '',
				e.receiptType ? (e.receiptType === 'application/pdf' ? 'PDF' : 'Photo') : ''
			]
		)
	];
	return '\uFEFF' + lines.map((r) => r.map(safeCell).join(',')).join('\r\n') + '\r\n';
}

/** Every expense on the keeper's own tanks, archived ones too, newest first: the whole ledger (#314). */
export function ownedLedger(userId: string) {
	const own = db.select({ id: tanks.id, name: tanks.name }).from(tanks).where(eq(tanks.userId, userId)).all();
	const ids = own.map((t) => t.id);
	const rows = ids.length ? db.select().from(expenses).where(inArray(expenses.tankId, ids)).orderBy(desc(expenses.date), desc(expenses.createdAt)).all() : [];
	return { rows, tankNames: new Map(own.map((t) => [t.id, t.name])), items: equipmentNames(ids) };
}

// ── Receipts ────────────────────────────────────────────────────────────────

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const root = () => join(dataDir(), 'receipts');
const fullPath = (p: string) => join(root(), p);
// a new name for each file (#118), so a replacement never writes over the one the row still points at
const receiptFile = (tankId: string, expenseId: string, type: string) =>
	join(tankId, `${expenseId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${type === 'application/pdf' ? 'pdf' : 'jpg'}`);

/** A receipt's file, for the owner's page. */
export async function receiptOf(userId: string, id: string) {
	const e = getExpense(userId, id);
	if (!e.receiptPath || !e.receiptType) error(404, 'No receipt');
	try {
		return { body: await readFile(fullPath(e.receiptPath)), type: e.receiptType, expense: e };
	} catch {
		error(404, 'Receipt file missing');
	}
}

/** Attach (or replace) a receipt: a photo, kept as a JPEG without its metadata, or a PDF. */
export async function attachReceipt(userId: string, id: string, file: File): Promise<{ error: string } | null> {
	const e = getExpense(userId, id);
	requireRoleOn(userId, e.tankId, 'owner');
	if (file.size > MAX_RECEIPT_BYTES) return { error: 'That receipt is over 10 MB.' };
	const buf = Buffer.from(await file.arrayBuffer());
	let type: 'image/jpeg' | 'application/pdf';
	let body: Buffer;
	if (buf.subarray(0, 5).toString('latin1') === '%PDF-') {
		type = 'application/pdf';
		body = buf;
	} else {
		try {
			body = await sharp(buf, { failOn: 'error', limitInputPixels: 100_000_000 })
				.rotate()
				.resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
				.jpeg({ quality: 82 })
				.toBuffer();
		} catch {
			return { error: "That file isn't a photo or a PDF." };
		}
		type = 'image/jpeg';
	}
	// the new file, the row, then the old file (#118)
	const path = receiptFile(e.tankId, e.id, type);
	await writeThen([[fullPath(path), body]], () => db.update(expenses).set({ receiptPath: path, receiptType: type }).where(eq(expenses.id, e.id)).run());
	if (e.receiptPath) await removeFiles([fullPath(e.receiptPath)], 'server');
	return null;
}

export async function removeReceipt(userId: string, id: string) {
	const e = getExpense(userId, id);
	requireRoleOn(userId, e.tankId, 'owner');
	db.update(expenses).set({ receiptPath: null, receiptType: null }).where(eq(expenses.id, e.id)).run();
	if (e.receiptPath) await removeFiles([fullPath(e.receiptPath)], 'server');
}

/** For the backup: where a receipt's file is. */
export const receiptFilePath = (p: string) => fullPath(p);

/** Remove a receipt's file (an expense's import undone). */
export const deleteExpenseReceipt = (path: string) => removeFiles([fullPath(path)], 'import');
