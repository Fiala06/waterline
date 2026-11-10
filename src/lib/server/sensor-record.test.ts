import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// A sensor as a parameter's reading of record (Parameters & targets): the
// newest of its latest sample and the latest test is the reading, and a run
// of out-of-range readings has one start, so its alert keeps one key.
const dir = mkdtempSync(join(tmpdir(), 'wl-record-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { createTest, latestReadings } = await import('./logs');
const { outOfRangeSince, recordSamples } = await import('./sensors');
const { createTank, listParams, updateParams } = await import('./tanks');
const { upsertUser } = await import('./users');

const user = upsertUser({ email: 'record@example.com', name: 'Record', googleSub: 'g-record' });
const tank = createTank(user, { name: 'Probe tank', type: 'freshwater', nominalVolumeL: 40 });
const temp = listParams(tank.id).find((p) => p.key === 'temp')!;
const ph = listParams(tank.id).find((p) => p.key === 'ph')!;
const t0 = Date.parse('2026-10-13T10:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;
const target = (on: boolean) => updateParams(user.id, tank.id, [{ id: temp.id, min: 22, max: 26, tracked: true, sensorRecord: on }]);
const test = (at: number, readings: [string, number][]) => createTest(user.id, tank.id, { takenAt: iso(at), note: null, readings: new Map(readings) }, { timeZone: 'UTC' });

describe('a sensor as the reading of record', () => {
	it('is the reading when on and newer than the latest test, naming its source', () => {
		target(false);
		test(t0, [
			[temp.id, 24],
			[ph.id, 7]
		]);
		recordSamples(tank.id, [{ parameter: 'temp', value: 25.5, at: iso(t0 + 2 * MIN) }], 'Apollo', null, t0 + 2 * MIN);
		// off: the test is the reading, as ever
		expect(latestReadings(tank.id).get(temp.id)).toEqual({ value: 24, takenAt: iso(t0) });
		target(true);
		expect(latestReadings(tank.id).get(temp.id)).toEqual({ value: 25.5, takenAt: iso(t0 + 2 * MIN), sensor: 'Apollo' });
		// the other parameters are the tests' still
		expect(latestReadings(tank.id).get(ph.id)).toEqual({ value: 7, takenAt: iso(t0) });
		// a newer test is the reading again
		test(t0 + 4 * MIN, [[temp.id, 24.5]]);
		expect(latestReadings(tank.id).get(temp.id)).toEqual({ value: 24.5, takenAt: iso(t0 + 4 * MIN) });
		// left as it is when the targets are saved without the switch on the page
		updateParams(user.id, tank.id, [{ id: temp.id, min: 22, max: 26, tracked: true }]);
		expect(listParams(tank.id).find((p) => p.id === temp.id)?.sensorRecord).toBe(true);
	});

	it('says since when the sensor has read out of range, and nothing once it is back in', () => {
		target(true);
		recordSamples(
			tank.id,
			[
				{ parameter: 'temp', value: 25, at: iso(t0 + 10 * MIN) },
				{ parameter: 'temp', value: 27, at: iso(t0 + 12 * MIN) },
				{ parameter: 'temp', value: 27.5, at: iso(t0 + 14 * MIN) }
			],
			'Apollo',
			null,
			t0 + 14 * MIN
		);
		expect(outOfRangeSince(tank.id, temp.id, { min: 22, max: 26 })).toEqual({ since: iso(t0 + 12 * MIN), count: 2, old: false });
		expect(latestReadings(tank.id).get(temp.id)).toEqual({ value: 27.5, takenAt: iso(t0 + 14 * MIN), sensor: 'Apollo', since: iso(t0 + 12 * MIN) });
		// one side only, and no target at all
		expect(outOfRangeSince(tank.id, temp.id, { min: null, max: 26 })).toEqual({ since: iso(t0 + 12 * MIN), count: 2, old: false });
		expect(outOfRangeSince(tank.id, temp.id, { min: 22, max: null })).toBeNull();
		expect(outOfRangeSince(tank.id, temp.id, { min: null, max: null })).toBeNull();
		// back in range
		recordSamples(tank.id, [{ parameter: 'temp', value: 25.8, at: iso(t0 + 16 * MIN) }], 'Apollo', null, t0 + 16 * MIN);
		expect(outOfRangeSince(tank.id, temp.id, { min: 22, max: 26 })).toBeNull();
		expect(latestReadings(tank.id).get(temp.id)).toEqual({ value: 25.8, takenAt: iso(t0 + 16 * MIN), sensor: 'Apollo' });
	});

	it('keeps one start through a dip back in range, and a new one once it has stayed in for 15 minutes (#228)', () => {
		const at = (min: number, value: number) => recordSamples(tank.id, [{ parameter: 'temp', value, at: iso(t0 + min * MIN) }], 'Apollo', null, t0 + min * MIN);
		const range = { min: 22, max: 26 };
		// high, one reading just back inside, high again: the same stretch, begun at 60
		at(60, 26.1);
		at(65, 26.2);
		at(70, 25.9);
		at(75, 26.1);
		expect(outOfRangeSince(tank.id, temp.id, range)).toEqual({ since: iso(t0 + 60 * MIN), count: 3, old: false });
		// a few readings inside, but only 10 minutes of them: still the same stretch
		at(80, 25.8);
		at(85, 25.9);
		at(90, 26.3);
		expect(outOfRangeSince(tank.id, temp.id, range)).toEqual({ since: iso(t0 + 60 * MIN), count: 4, old: false });
		// inside from 95 until it reads high at 115: that stretch was over, and this is a new one
		at(95, 25.5);
		at(105, 25.5);
		expect(outOfRangeSince(tank.id, temp.id, range)).toBeNull();
		at(115, 26.4);
		expect(outOfRangeSince(tank.id, temp.id, range)).toEqual({ since: iso(t0 + 115 * MIN), count: 1, old: false });
	});

	it('marks a stretch that began before the week of readings looked through as old (#228)', () => {
		const DAY = 1440 * MIN;
		const later = t0 + 30 * DAY;
		const at = (ms: number, value: number) => recordSamples(tank.id, [{ parameter: 'temp', value, at: iso(ms) }], 'Apollo', null, ms);
		at(later, 27);
		at(later + 8 * DAY, 27.1);
		expect(outOfRangeSince(tank.id, temp.id, { min: 22, max: 26 })).toMatchObject({ old: true });
	});
});
