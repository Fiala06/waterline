import { existsSync, mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

// Backups and share images that nobody can reach any more don't stay on disk
// (#213). A database of its own, with every migration.
const dir = mkdtempSync(join(tmpdir(), 'wl-export-cleanup-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { exports } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { cleanupExports, failInterruptedExports, startExport } = await import('./export');
const { removePerson } = await import('./people');
const { ogCacheDir, pruneShareImages } = await import('./og-cache');

const admin = upsertUser({ email: 'admin@example.com', name: 'Admin', googleSub: 'g-admin' });
const keeper = upsertUser({ email: 'keeper@example.com', name: 'Keeper', googleSub: 'g-keeper' });
createTank(keeper, { name: 'Riverbed 40', type: 'planted', nominalVolumeL: 150 });
const folder = join(dir, 'exports');
const files = () => readdirSync(folder).toSorted();

async function built(format: 'zip' | 'csv') {
	const { id } = startExport(keeper, 'account', null, format);
	for (let i = 0; i < 200; i++) {
		const row = db.select().from(exports).where(eq(exports.id, id)).get()!;
		if (row.status !== 'building') return row;
		await new Promise((r) => setTimeout(r, 25));
	}
	throw new Error('the export never finished');
}
const row = (over: Partial<typeof exports.$inferInsert>) => db.insert(exports).values({ userId: keeper.id, scope: 'account', format: 'zip', ...over }).returning().get();

describe('export files (#213)', () => {
	it('keeps what can still be downloaded or is being built, and removes the rest', async () => {
		const ready = await built('zip');
		expect(ready.status).toBe('ready');
		// a build the server restarted under, with what it had written so far
		const interrupted = row({ status: 'building' });
		writeFileSync(join(folder, `${interrupted.id}.zip`), 'half');
		// one that failed, one whose 24 hours are up, and one whose person (and so its row) is gone
		const failed = row({ status: 'failed' });
		writeFileSync(join(folder, `${failed.id}.csv`), 'half');
		const old = row({ status: 'ready', filePath: join(folder, 'old.zip'), expiresAt: '2020-01-01T00:00:00.000Z' });
		writeFileSync(join(folder, 'old.zip'), 'old');
		writeFileSync(join(folder, 'no-such-export.zip'), 'orphan');

		cleanupExports();
		// still building, as far as anyone knows: left alone
		expect(files()).toEqual([`${interrupted.id}.zip`, `${ready.id}.zip`].toSorted());
		expect(db.select().from(exports).where(eq(exports.id, old.id)).get()).toMatchObject({ status: 'expired', filePath: null });

		// on start, interrupted builds are marked failed, and the cleanup takes their files
		failInterruptedExports();
		cleanupExports();
		expect(files()).toEqual([`${ready.id}.zip`]);
	});

	it('go with the person when they’re removed', async () => {
		const csv = await built('csv');
		expect(files()).toContain(`${csv.id}.csv`);
		await removePerson(admin, keeper.id);
		expect(files()).toEqual([]);
		expect(db.select().from(exports).all()).toEqual([]);
	});
});

describe('share images (#213)', () => {
	it('go after 30 days; newer ones stay', () => {
		expect(pruneShareImages()).toBe(0); // no folder yet
		mkdirSync(ogCacheDir(), { recursive: true });
		const now = Date.now();
		const fresh = join(ogCacheDir(), 'v3-t-fresh-2.png');
		const stale = join(ogCacheDir(), 'v3-t-stale-1.png');
		writeFileSync(fresh, 'png');
		writeFileSync(stale, 'png');
		utimesSync(stale, new Date(now - 31 * 86_400_000), new Date(now - 31 * 86_400_000));
		expect(pruneShareImages(now)).toBe(1);
		expect(existsSync(fresh)).toBe(true);
		expect(existsSync(stale)).toBe(false);
	});
});
