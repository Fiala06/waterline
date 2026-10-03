// Spending (#7): what's spent on a tank, its totals, and a receipt for each
// (#8), a photo (resized, without its metadata) or a PDF, kept in
// DATA_DIR/receipts and shown only to its owner.
import { error } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { addDays } from '$lib/time';
import { db } from './db';
import { requireRoleOn, visibleTo } from './members';
import { expenses, tanks, type Expense } from './db/schema';
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
}

export function listExpenses(userId: string, tankId: string) {
	getTank(userId, tankId);
	return db.select().from(expenses).where(eq(expenses.tankId, tankId)).orderBy(desc(expenses.date), desc(expenses.createdAt)).all();
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

export function addExpense(userId: string, tankId: string, input: ExpenseInput, importId: string | null = null) {
	getTank(userId, tankId, 'owner');
	return db.insert(expenses).values({ ...input, tankId, importId }).returning().get();
}

/** An expense's details; moving it to another of the keeper's tanks keeps its receipt. */
export function updateExpense(userId: string, id: string, input: ExpenseInput & { tankId: string }) {
	const before = getExpense(userId, id);
	getTank(userId, input.tankId, 'owner');
	let receiptPath = before.receiptPath;
	if (receiptPath && input.tankId !== before.tankId) {
		const moved = receiptFile(input.tankId, before.id, before.receiptType!);
		mkdirSync(dirname(fullPath(moved)), { recursive: true });
		writeFileSync(fullPath(moved), readFileSync(fullPath(receiptPath)));
		rmSync(fullPath(receiptPath), { force: true });
		receiptPath = moved;
	}
	return db.update(expenses).set({ ...input, receiptPath }).where(eq(expenses.id, id)).returning().get();
}

export function deleteExpense(userId: string, id: string) {
	const e = getExpense(userId, id);
	requireRoleOn(userId, e.tankId, 'owner');
	if (e.receiptPath) rmSync(fullPath(e.receiptPath), { force: true });
	db.delete(expenses).where(eq(expenses.id, id)).run();
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
 */
export function spendingSummary(rows: Pick<Expense, 'date' | 'amountCents' | 'category'>[], today: string) {
	const month = today.slice(0, 7);
	const year = today.slice(0, 4);
	const sum = (xs: typeof rows) => xs.reduce((n, e) => n + e.amountCents, 0);
	const thisYear = rows.filter((e) => e.date.startsWith(year));
	const byCategory = Object.entries(CATEGORY_LABEL)
		.map(([key, label]) => ({ key: key as ExpenseCategory, label, cents: sum(thisYear.filter((e) => e.category === key)) }))
		.filter((c) => c.cents > 0)
		.sort((a, b) => b.cents - a.cents);
	const months: { key: string; label: string; cents: number }[] = [];
	let d = `${month}-01`;
	for (let i = 0; i < MONTHS; i++) {
		const key = d.slice(0, 7);
		months.unshift({ key, label: monthLabel(key), cents: sum(rows.filter((e) => e.date.startsWith(key))) });
		d = addDays(d, -1).slice(0, 7) + '-01'; // the month before
	}
	return { month: sum(rows.filter((e) => e.date.startsWith(month))), year: sum(thisYear), all: sum(rows), byCategory, months };
}

/** This year's spending on all of the keeper's tanks (archived ones too). */
export function spentThisYear(userId: string, year: string) {
	const ids = db.select({ id: tanks.id }).from(tanks).where(eq(tanks.userId, userId)).all().map((t) => t.id);
	if (!ids.length) return 0;
	return db
		.select({ c: expenses.amountCents, date: expenses.date })
		.from(expenses)
		.where(inArray(expenses.tankId, ids))
		.all()
		.filter((e) => e.date.startsWith(year))
		.reduce((n, e) => n + e.c, 0);
}

// ── Receipts ────────────────────────────────────────────────────────────────

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const root = () => join(dataDir(), 'receipts');
const fullPath = (p: string) => join(root(), p);
const receiptFile = (tankId: string, expenseId: string, type: string) => join(tankId, `${expenseId}.${type === 'application/pdf' ? 'pdf' : 'jpg'}`);

/** A receipt's file, for the owner's page. */
export function receiptOf(userId: string, id: string) {
	const e = getExpense(userId, id);
	if (!e.receiptPath || !e.receiptType) error(404, 'No receipt');
	return { body: readFileSync(fullPath(e.receiptPath)), type: e.receiptType, expense: e };
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
	const path = receiptFile(e.tankId, e.id, type);
	if (e.receiptPath && e.receiptPath !== path) rmSync(fullPath(e.receiptPath), { force: true });
	mkdirSync(dirname(fullPath(path)), { recursive: true });
	writeFileSync(fullPath(path), body);
	db.update(expenses).set({ receiptPath: path, receiptType: type }).where(eq(expenses.id, e.id)).run();
	return null;
}

export function removeReceipt(userId: string, id: string) {
	const e = getExpense(userId, id);
	requireRoleOn(userId, e.tankId, 'owner');
	if (e.receiptPath) rmSync(fullPath(e.receiptPath), { force: true });
	db.update(expenses).set({ receiptPath: null, receiptType: null }).where(eq(expenses.id, e.id)).run();
}

/** For the backup: where a receipt's file is. */
export const receiptFilePath = (p: string) => fullPath(p);

/** Remove a receipt's file (an expense's import undone). */
export const deleteExpenseReceipt = (path: string) => rmSync(fullPath(path), { force: true });
