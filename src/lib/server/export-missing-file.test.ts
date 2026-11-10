import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

// A photo deleted while a backup is building (#207): yazl opens each file when
// its turn comes and reports a failure on the archive itself. With nobody
// listening that ended the whole server; now the export fails and the half
// archive goes. A database of its own, with every migration.
const dir = mkdtempSync(join(tmpdir(), 'wl-export-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { exports, photos } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { photoFilePath } = await import('./photos');
const { startExport } = await import('./export');

const user = upsertUser({ email: 'keeper@example.com', name: 'Keeper', googleSub: 'g-keeper' });
const tank = createTank(user, { name: 'Riverbed 40', type: 'planted', nominalVolumeL: 150 });

function addPhoto(name: string) {
	const p = db
		.insert(photos)
		.values({ tankId: tank.id, path: `${tank.id}/${name}.jpg`, thumbPath: `${tank.id}/${name}-thumb.jpg`, width: 4, height: 3, takenAt: '2026-10-01T09:00:00.000Z' })
		.returning()
		.get();
	mkdirSync(dirname(photoFilePath(p, 'full')), { recursive: true });
	writeFileSync(photoFilePath(p, 'full'), Buffer.alloc(2000, 1));
	return p;
}

async function settled(id: string) {
	for (let i = 0; i < 200; i++) {
		const row = db.select().from(exports).where(eq(exports.id, id)).get()!;
		if (row.status !== 'building') return row;
		await new Promise((r) => setTimeout(r, 25));
	}
	throw new Error('the export never finished');
}

describe('a backup whose photo goes missing while it builds (#207)', () => {
	it('fails that export, leaves no half archive, and the server carries on to build the next', async () => {
		const first = addPhoto('one');
		const second = addPhoto('two');
		const unhandled: unknown[] = [];
		const onError = (e: unknown) => unhandled.push(e);
		process.on('uncaughtException', onError).on('unhandledRejection', onError);
		try {
			const started = startExport(user, 'account', null, 'zip');
			// queued, not yet opened: the archive reads each file when its turn comes
			rmSync(photoFilePath(second, 'full'));
			const failed = await settled(started.id);
			expect(failed.status).toBe('failed');
			expect(failed.error).toBe('The export failed. Try again.');
			expect(existsSync(join(dir, 'exports', `${started.id}.zip`))).toBe(false);

			// with the missing photo skipped up front, the next one builds
			const again = await settled(startExport(user, 'account', null, 'zip').id);
			expect(again.status).toBe('ready');
			expect(again.summary).toContain('2 photos');
			expect(readdirSync(join(dir, 'exports'))).toEqual([`${again.id}.zip`]);
			expect(existsSync(photoFilePath(first, 'full'))).toBe(true);
			await new Promise((r) => setTimeout(r, 50));
			expect(unhandled).toEqual([]);
		} finally {
			process.off('uncaughtException', onError).off('unhandledRejection', onError);
		}
	});
});
