import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'wl-sensors-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { latestSamples, parseSamples, pruneSamples, recordSamples, sampleSeries, toStoredSample } = await import('./sensors');
const { createTank, listParams } = await import('./tanks');
const { upsertUser } = await import('./users');
const { authenticateAssistant, authenticateSensor, createAssistantToken } = await import('./assistant/tokens');

const user = upsertUser({ email: 'probe@example.com', name: 'Probe', googleSub: 'g-probe' });
const tank = createTank(user, { name: 'Probe tank', type: 'freshwater', nominalVolumeL: 100 });
const temp = listParams(tank.id).find((p) => p.key === 'temp')!;

describe('sensor readings (#19)', () => {
	it('reads one sample or a list, and refuses junk with a reason', () => {
		expect(parseSamples({ parameter: 'temp', value: 25.4 })).toEqual([{ parameter: 'temp', value: 25.4, unit: null, at: null }]);
		expect(parseSamples({ readings: [{ parameter: 'ph', value: '7,2', unit: 'pH', at: '2026-10-03T10:00:00Z' }] })).toEqual([{ parameter: 'ph', value: 7.2, unit: 'pH', at: '2026-10-03T10:00:00Z' }]);
		expect(parseSamples({ parameter: 'temp' })).toMatch(/must be a number/);
		expect(parseSamples({ value: 1 })).toMatch(/needs a "parameter"/);
		expect(parseSamples({ parameter: 'temp', value: 1, at: 'yesterday' })).toMatch(/ISO 8601/);
		expect(parseSamples({ readings: Array.from({ length: 101 }, () => ({ parameter: 'temp', value: 1 })) })).toMatch(/At most 100/);
	});
	it('converts °F and ppm, and leaves the rest', () => {
		expect(toStoredSample({ key: 'temp' }, 77, '°F')).toBeCloseTo(25);
		expect(toStoredSample({ key: 'temp' }, 25, 'C')).toBe(25);
		expect(toStoredSample({ key: 'gh' }, 178.48, 'ppm')).toBeCloseTo(10);
		expect(toStoredSample({ key: 'no3' }, 10, 'ppm')).toBe(10);
	});
	it('keeps one sample a minute per parameter, matches by key or name, and refuses unknown ones', () => {
		const t0 = Date.parse('2026-10-03T10:00:00Z');
		const r = recordSamples(tank.id, [{ parameter: 'temp', value: 77, unit: '°F', at: '2026-10-03T10:00:00Z' }, { parameter: 'Temperature', value: 25.5, at: '2026-10-03T10:00:30Z' }, { parameter: 'temp', value: 25.6, at: '2026-10-03T10:02:00Z' }, { parameter: 'salinity', value: 1 }], 'ESPHome', null, t0 + 3 * 60_000);
		expect(r.map((x) => (x.ok ? x.stored : x.error.slice(0, 12)))).toEqual([true, false, true, 'No parameter']);
		expect(latestSamples(tank.id).get(temp.id)).toMatchObject({ value: 25.6, source: 'ESPHome' });
		expect(recordSamples(tank.id, [{ parameter: 'temp', value: 1, at: '2027-01-01T00:00:00Z' }], 'x', null, t0)[0]).toMatchObject({ ok: false });
	});
	it('averages a dense series into buckets', () => {
		const t0 = Date.parse('2026-10-04T00:00:00Z');
		recordSamples(tank.id, Array.from({ length: 600 }, (_, i) => ({ parameter: 'temp', value: 20 + (i % 10), at: new Date(t0 + i * 60_000).toISOString() })), 'probe', null, t0 + 700 * 60_000);
		const pts = sampleSeries(tank.id, temp.id, '2026-10-04T00:00:00Z', 50, t0 + 600 * 60_000);
		expect(pts.length).toBeLessThanOrEqual(51);
		expect(pts.length).toBeGreaterThan(40);
		for (const p of pts) expect(p.v).toBeGreaterThanOrEqual(20);
		expect(pruneSamples(Date.parse('2028-01-01T00:00:00Z'))).toBeGreaterThan(0);
	});
	it('a sensor token adds readings and nothing else; an assistant token the reverse', () => {
		const { token } = createAssistantToken(user.id, 'Apex', [tank.id], 'sensor');
		expect(token.startsWith('wls_')).toBe(true);
		expect(authenticateSensor(`Bearer ${token}`)?.tankIds.has(tank.id)).toBe(true);
		expect(authenticateAssistant(`Bearer ${token}`)).toBeNull();
		const { token: read } = createAssistantToken(user.id, 'Claude', [tank.id]);
		expect(authenticateSensor(`Bearer ${read}`)).toBeNull();
		expect(authenticateAssistant(`Bearer ${read}`)?.token.kind).toBe('assistant');
	});

	it('stores a full request of 100 readings in one go, and settles nearby ones in its order (#113)', () => {
		const t0 = Date.parse('2026-10-05T00:00:00Z');
		const hundred = Array.from({ length: 100 }, (_, i) => ({ parameter: 'temp', value: 24 + i / 100, at: new Date(t0 + i * 61_000).toISOString() }));
		const r = recordSamples(tank.id, hundred, 'probe', null, t0 + 200 * 60_000);
		expect(r.every((x) => x.ok && x.stored)).toBe(true);
		// the same again: all within a minute of a stored one
		expect(recordSamples(tank.id, hundred, 'probe', null, t0 + 200 * 60_000).every((x) => x.ok && !x.stored)).toBe(true);
		// in one request, the first of two readings 20 s apart is kept, the next refused, a later one kept
		const t1 = Date.parse('2026-10-06T00:00:00Z');
		const mixed = recordSamples(
			tank.id,
			[
				{ parameter: 'temp', value: 25, at: new Date(t1).toISOString() },
				{ parameter: 'Temperature', value: 26, at: new Date(t1 + 20_000).toISOString() },
				{ parameter: 'nope', value: 1 },
				{ parameter: 'temp', value: 27, at: new Date(t1 + 61_000).toISOString() }
			],
			'probe',
			null,
			t1 + 5 * 60_000
		);
		expect(mixed.map((x) => (x.ok ? x.stored : 'error'))).toEqual([true, false, 'error', true]);
	});

	it('looks and stores inside one write transaction, so two requests never both find the same gap (#113)', async () => {
		const { db } = await import('./db');
		const spy = vi.spyOn(db, 'transaction');
		const at = '2026-10-07T00:00:00.000Z';
		recordSamples(tank.id, [{ parameter: 'temp', value: 25, at }], 'probe', null, Date.parse(at) + 60_000);
		// BEGIN IMMEDIATE: the write lock is held before the gap check, so a second writer waits for it
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0][1]).toEqual({ behavior: 'immediate' });
		spy.mockRestore();
	});
});
