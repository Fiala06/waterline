import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// "About 48 MB": each tank's backup and the account's, every file stat'ed once (#357).
const dir = mkdtempSync(join(tmpdir(), 'wl-export-estimate-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { expenses, photos } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank, setArchived } = await import('./tanks');
const { photoFilePath } = await import('./photos');
const { receiptFilePath } = await import('./expenses');
const { estimateBackupSizes } = await import('./export');

const user = upsertUser({ email: 'estimate@example.com', name: 'Estimate', googleSub: 'g-estimate' });
const nobody = upsertUser({ email: 'empty@example.com', name: 'Empty', googleSub: 'g-empty' });
const a = createTank(user, { name: 'A', type: 'planted', nominalVolumeL: 150 });
const b = createTank(user, { name: 'B', type: 'planted', nominalVolumeL: 50 });
const old = createTank(user, { name: 'Old', type: 'planted', nominalVolumeL: 50 });
setArchived(user.id, old.id, true);

const write = (path: string, bytes: number) => (mkdirSync(dirname(path), { recursive: true }), writeFileSync(path, Buffer.alloc(bytes, 1)));
function photo(tankId: string, name: string, bytes: number | null) {
	const p = db.insert(photos).values({ tankId, path: `${tankId}/${name}.jpg`, thumbPath: `${tankId}/${name}-t.jpg`, width: 1, height: 1, takenAt: '2026-10-01T09:00:00.000Z' }).returning().get();
	if (bytes != null) write(photoFilePath(p, 'full'), bytes);
}
photo(a.id, 'one', 3000);
photo(a.id, 'two', 1000);
photo(a.id, 'gone', null); // a missing file counts nothing
photo(old.id, 'kept', 500);
db.insert(expenses).values({ tankId: b.id, what: 'Heater', date: '2026-10-01', amountCents: 100, receiptPath: 'receipts/r1.jpg' }).run();
write(receiptFilePath('receipts/r1.jpg'), 700);

describe('backup size estimates', () => {
	it('totals each tank, archived ones too, and the account', async () => {
		const { account, tanks } = await estimateBackupSizes(user);
		expect(tanks.get(a.id)).toBe(50_000 + 4000);
		expect(tanks.get(b.id)).toBe(50_000 + 700);
		expect(tanks.get(old.id)).toBe(50_000 + 500);
		expect(account).toBe(50_000 + 5200);
	});

	it('is nothing for someone without tanks', async () => {
		expect(await estimateBackupSizes(nobody)).toEqual({ account: 0, tanks: new Map() });
	});
});
