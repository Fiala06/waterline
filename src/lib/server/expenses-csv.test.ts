import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Spending as a CSV (#314): every expense of the keeper's own tanks, archived
// ones too, in its own currency, guarded against formulas, with a receipt
// said to be there but never linked.
const dir = mkdtempSync(join(tmpdir(), 'wl-expenses-csv-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { expenses } = await import('./db/schema');
const { eq } = await import('drizzle-orm');
const { upsertUser } = await import('./users');
const { createTank, setArchived } = await import('./tanks');
const { addExpense, expensesCsv, ownedLedger } = await import('./expenses');
const { parseCsv } = await import('$lib/csv');

const me = upsertUser({ email: 'csv-keeper@example.com', name: 'Keeper', googleSub: 'g-csv-keeper' });
const someone = upsertUser({ email: 'csv-other@example.com', name: 'Other', googleSub: 'g-csv-other' });
const main = createTank(me, { name: 'Main, display', type: 'planted', nominalVolumeL: 200 });
const old = createTank(me, { name: 'Old cube', type: 'freshwater', nominalVolumeL: 20 });
const theirs = createTank(someone, { name: 'Not mine', type: 'reef', nominalVolumeL: 100 });
addExpense(me.id, main.id, { date: '2026-09-01', amountCents: 2999, category: 'equipment', what: 'Heater', note: 'for "winter", maybe', currency: 'EUR' });
const risky = addExpense(me.id, main.id, { date: '2026-09-02', amountCents: 500, category: 'other', what: '=HYPERLINK("x")', note: null, currency: 'USD' });
db.update(expenses).set({ receiptPath: '/data/receipts/secret/file.jpg', receiptType: 'image/jpeg' }).where(eq(expenses.id, risky.id)).run();
addExpense(me.id, old.id, { date: '2025-01-05', amountCents: 1200, category: 'plants', what: 'Moss', note: null, currency: 'GBP' });
setArchived(me.id, old.id, true);
addExpense(someone.id, theirs.id, { date: '2026-09-03', amountCents: 9999, category: 'livestock', what: 'Tang', note: null, currency: 'USD' });

describe('spending as a CSV (#314)', () => {
	it('holds every expense of my own tanks, archived too, each in its own currency', () => {
		const { rows, tankNames, items } = ownedLedger(me.id);
		const text = expensesCsv(rows, tankNames, items);
		expect(text.startsWith('﻿')).toBe(true);
		const csv = parseCsv(text.slice(1));
		expect(csv[0]).toEqual(['Date', 'Amount', 'Currency', 'Category', 'What for', 'Item', 'Note', 'Tank', 'Receipt']);
		expect(csv.slice(1)).toEqual([
			['2026-09-02', '5.00', 'USD', 'Other', `'=HYPERLINK("x")`, '', '', 'Main, display', 'Photo'],
			['2026-09-01', '29.99', 'EUR', 'Equipment', 'Heater', '', 'for "winter", maybe', 'Main, display', ''],
			['2025-01-05', '12.00', 'GBP', 'Plants', 'Moss', '', '', 'Old cube', '']
		]);
		// never where a receipt is, nor anyone else's spending
		expect(text).not.toContain('/data/receipts');
		expect(text).not.toContain('Tang');
	});
});
