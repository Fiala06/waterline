import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import yazl from 'yazl';

// A backup keeps your notification choices but never the ntfy topic's address
// or its token (#321), in a whole-account backup or one tank's.
const dir = mkdtempSync(join(tmpdir(), 'wl-export-ntfy-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { exports, notificationPrefs } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { startExport } = await import('./export');
const { zipEntries, zipRead } = await import('./zip-read');
const { getUser } = await import('./users');
const { previewRestore, restoreBackup } = await import('./restore');

const user = upsertUser({ email: 'ntfy-keeper@example.com', name: 'Keeper', googleSub: 'g-ntfy-keeper' });
const tank = createTank(user, { name: 'Shrimp cube', type: 'freshwater', nominalVolumeL: 20 });
const TOPIC = 'https://ntfy.example.test/wl-secret-topic-7f3a';
const TOKEN = 'enc:v1:fixture-ntfy-token-cipher';
const set = { ntfyUrl: TOPIC, ntfyTokenEnc: TOKEN, delivery: 'daily', sendTime: '07:30', pushGrouped: false, quietStart: '22:00', quietEnd: '07:00' } as const;
db.insert(notificationPrefs)
	.values({ userId: user.id, ...set })
	.onConflictDoUpdate({ target: notificationPrefs.userId, set })
	.run();

async function backupJson(scope: 'account' | 'tank'): Promise<string> {
	const row = startExport(user, scope, scope === 'tank' ? tank.id : null, 'zip');
	for (let i = 0; i < 400; i++) {
		const r = db.select().from(exports).where(eq(exports.id, row.id)).get()!;
		if (r.status === 'ready') {
			const buf = readFileSync(join(dir, 'exports', `${row.id}.zip`));
			return zipRead(buf, zipEntries(buf).get('waterline.json')!, 64 * 1024 * 1024).toString('utf8');
		}
		if (r.status === 'failed') throw new Error(`export failed: ${r.error}`);
		await new Promise((res) => setTimeout(res, 25));
	}
	throw new Error('export never finished');
}

describe("a backup's notification choices (#321)", () => {
	for (const scope of ['account', 'tank'] as const) {
		it(`leave out the ntfy topic and its token in a ${scope} backup`, async () => {
			const text = await backupJson(scope);
			expect(text).not.toContain('ntfyUrl');
			expect(text).not.toContain('ntfyTokenEnc');
			expect(text).not.toContain(TOPIC);
			expect(text).not.toContain('wl-secret-topic');
			expect(text).not.toContain(TOKEN);
			const { account } = JSON.parse(text);
			expect(account.notifications).toMatchObject({ delivery: 'daily', sendTime: '07:30', pushGrouped: false, quietStart: '22:00', quietEnd: '07:00', taskReminders: true });
		});
	}

	it('restoring an older backup that has them sets up no ntfy', async () => {
		const z = new yazl.ZipFile();
		const old = {
			format: 'waterline-backup',
			version: 2,
			account: { notifications: { ntfyUrl: 'https://ntfy.example.test/old-topic', ntfyTokenEnc: 'enc:v1:old', delivery: 'weekly' } },
			tanks: [{ id: 'old-tank', name: 'Old cube', type: 'freshwater' }]
		};
		z.addBuffer(Buffer.from(JSON.stringify(old)), 'waterline.json');
		z.end();
		const parts: Buffer[] = [];
		for await (const c of z.outputStream) parts.push(c as Buffer);
		const someone = getUser(upsertUser({ email: 'ntfy-restorer@example.com', name: 'Restorer', googleSub: 'g-ntfy-restorer' }).id)!;
		const { token } = previewRestore(someone, Buffer.concat(parts));
		await restoreBackup(someone, token, ['old-tank']);
		const prefs = db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, someone.id)).get();
		expect(prefs?.ntfyUrl ?? null).toBeNull();
		expect(prefs?.ntfyTokenEnc ?? null).toBeNull();
		expect(prefs?.delivery ?? 'individual').toBe('individual');
	});
});
