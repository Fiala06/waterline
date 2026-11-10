import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

// Who an out-of-range alert goes to, and how often (#228, #229). Emails land
// in DATA_DIR/outbox instead of being sent. A database of its own.
const dir = mkdtempSync(join(tmpdir(), 'wl-alerts-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir, ORIGIN: 'https://tanks.example.com', EMAIL_TRANSPORT: 'outbox', OPEN_SIGNUP: 'true' } }));
const { db } = await import('./db');
const { emailLog, tanks } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank, getTank, listParams, updateParams } = await import('./tanks');
const { inviteMember } = await import('./members');
const { createTest } = await import('./logs');
const { recordSamples } = await import('./sensors');
const { alertOutOfRange, alertSensorExcursions } = await import('./notifications');

const owner = upsertUser({ email: 'owner@example.com', name: 'Owner', googleSub: 'g-owner' });
const helper = upsertUser({ email: 'helper@example.com', name: 'Helper', googleSub: 'g-helper' });
const viewer = upsertUser({ email: 'viewer@example.com', name: 'Viewer', googleSub: 'g-viewer' });

/** The emails written since the last look: who to, and the subject. */
let seen = 0;
function mail(): { to: string; subject: string; text: string }[] {
	let names: string[] = [];
	try {
		names = readdirSync(join(dir, 'outbox')).toSorted();
	} catch {
		/* none yet */
	}
	const fresh = names.slice(seen).map((n) => JSON.parse(readFileSync(join(dir, 'outbox', n), 'utf8')));
	seen = names.length;
	return fresh;
}
const to = () => mail().map((m) => m.to).toSorted();

describe('an out-of-range test on a shared tank (#229)', () => {
	const tank = createTank(owner, { name: 'Shared 40', type: 'freshwater', nominalVolumeL: 150 });
	inviteMember(tank, helper.email, 'log', owner.id);
	inviteMember(tank, viewer.email, 'view', owner.id);
	const no3 = listParams(tank.id).find((p) => p.key === 'no3')!;
	updateParams(owner.id, tank.id, [{ id: no3.id, min: 5, max: 20, tracked: true }]);
	const bad = (by: typeof owner) => createTest(by.id, tank.id, { takenAt: new Date().toISOString(), note: null, readings: new Map([[no3.id, 500]]) }, { timeZone: 'UTC' }).test;

	it('alerts everyone the tank alerts, not only the person who logged it', async () => {
		await alertOutOfRange(helper, tank.id, bad(helper).id);
		const sent = mail();
		expect(sent.map((m) => m.to).toSorted()).toEqual(['helper@example.com', 'owner@example.com']);
		// the owner is told who logged it; someone who can only view isn't alerted
		expect(sent.find((m) => m.to === 'owner@example.com')!.text).toContain('by Helper');
		expect(sent.find((m) => m.to === 'helper@example.com')!.text).not.toContain('by Helper');
	});

	it('goes to the owner alone when alerts are the owner’s only, whoever logged it', async () => {
		db.update(tanks).set({ alertTo: 'owner' }).where(eq(tanks.id, tank.id)).run();
		await alertOutOfRange(helper, tank.id, bad(helper).id);
		expect(to()).toEqual(['owner@example.com']);
		await alertOutOfRange(owner, tank.id, bad(owner).id);
		expect(to()).toEqual(['owner@example.com']);
	});

	it('is sent once per test and person', async () => {
		const t = bad(owner);
		await alertOutOfRange(owner, tank.id, t.id);
		await alertOutOfRange(owner, tank.id, t.id);
		expect(to()).toEqual(['owner@example.com']);
	});
});

describe('a sensor hovering at its limit (#228)', () => {
	const tank = createTank(owner, { name: 'Heater 20', type: 'freshwater', nominalVolumeL: 75 });
	const temp = listParams(tank.id).find((p) => p.key === 'temp')!;
	updateParams(owner.id, tank.id, [{ id: temp.id, min: 22, max: 26, tracked: true, sensorRecord: true }]);
	const MIN = 60_000;
	// all of it in the last day, so the alerts' own times fall where they would
	const t0 = Date.now() - 20 * 3_600_000;
	/** A reading at `min` minutes, then the scheduler's look at it. */
	async function at(min: number, value: number) {
		const now = t0 + min * MIN;
		recordSamples(tank.id, [{ parameter: 'temp', value, at: new Date(now).toISOString() }], 'Probe', null, now);
		await alertSensorExcursions(now);
	}
	/** As if the alerts so far were sent this long ago. */
	const age = (ms: number) => db.update(emailLog).set({ sentAt: new Date(Date.now() - ms).toISOString() }).where(eq(emailLog.userId, owner.id)).run();

	it('alerts once while it cycles around the limit, not on every cycle', async () => {
		expect(getTank(owner.id, tank.id).name).toBe('Heater 20');
		mail();
		// 25 minutes at 26.1, one reading at 25.9, and round again: six times over
		let m = 0;
		for (let cycle = 0; cycle < 6; cycle++) {
			for (let i = 0; i < 5; i++, m += 5) await at(m, 26.1);
			await at(m, 25.9);
			m += 5;
		}
		const sent = mail();
		expect(sent.map((x) => x.to)).toEqual(['owner@example.com']);
		expect(sent[0].subject).toContain('Temperature');
	});

	it('holds a new stretch back for a few hours after the last alert, then alerts again', async () => {
		// back inside for half an hour: that stretch is over
		for (const m of [200, 210, 220, 230]) await at(m, 25);
		// out again, long enough to alert, but the last alert was moments ago
		for (const m of [240, 250, 260]) await at(m, 26.5);
		expect(to()).toEqual([]);
		// the last alert long enough ago (these readings are a day in the past), still out: now it goes
		age(48 * 3_600_000);
		await at(270, 26.5);
		expect(to()).toEqual(['owner@example.com']);
		// and only once for that stretch
		age(48 * 3_600_000);
		await at(280, 26.6);
		expect(to()).toEqual([]);
	});
});
