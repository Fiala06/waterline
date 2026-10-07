import { describe, expect, it } from 'vitest';
import { whatChanged } from './what-changed';

const prefs = { unitSystem: 'imperial', hardnessUnit: 'dgh' } as const;
const no3 = { key: 'no3', name: 'Nitrate', unit: 'ppm', decimals: 0, min: 5, max: 20 };
const DAY = 86_400_000;
const T0 = Date.parse('2026-09-20T09:00:00Z');
const at = (d: number) => T0 + d * DAY;

describe('whatChanged', () => {
	it('describes the latest run of readings the same way, and lists what was logged in it', () => {
		const r = whatChanged(
			no3,
			[
				{ t: at(0), value: 12 },
				{ t: at(4), value: 18 },
				{ t: at(8), value: 14 },
				{ t: at(12), value: 10 },
				{ t: at(16), value: 7 }
			],
			[
				{ id: 'a', t: at(2), title: 'Dosed Thrive · 5 mL' },
				{ id: 'b', t: at(9), title: 'Water change · 40% · Tap' },
				{ id: 'c', t: at(13), title: 'Trimmed plants' }
			],
			prefs
		)!;
		expect(r.headline).toBe('Nitrate fell from 18 → 7 ppm over 12 days.');
		expect(r.direction).toBe('down');
		expect(r.events.map((e) => e.id)).toEqual(['b', 'c']);
	});

	it('rides over a flat step and reads a rise too', () => {
		const r = whatChanged(
			no3,
			[
				{ t: at(0), value: 5 },
				{ t: at(3), value: 5 },
				{ t: at(6), value: 9 },
				{ t: at(7), value: 12 }
			],
			[],
			prefs
		)!;
		expect(r.headline).toBe('Nitrate rose from 5 → 12 ppm over 7 days.');
		expect(r.events).toEqual([]);
	});

	it('says "in a day" for a move within a day', () => {
		expect(whatChanged(no3, [{ t: at(0), value: 20 }, { t: at(0) + 3_600_000, value: 10 }], [], prefs)!.headline).toMatch(/in a day\.$/);
	});

	it('has nothing to say about a small move, one reading, a flat line, or an old one', () => {
		// a tenth of the 5–20 target span is 1.5
		expect(whatChanged(no3, [{ t: at(0), value: 10 }, { t: at(3), value: 11 }], [], prefs)).toBeNull();
		expect(whatChanged(no3, [{ t: at(0), value: 10 }], [], prefs)).toBeNull();
		expect(whatChanged(no3, [{ t: at(0), value: 10 }, { t: at(3), value: 10 }], [], prefs)).toBeNull();
		expect(whatChanged(no3, [{ t: at(0), value: 10 }, { t: at(90), value: 30 }], [], prefs)).toBeNull();
	});

	it('uses 15% of the reading without a full target, and the shown decimals', () => {
		const ph = { key: 'ph', name: 'pH', unit: '', decimals: 1, min: null, max: null };
		expect(whatChanged(ph, [{ t: at(0), value: 7.0 }, { t: at(2), value: 7.4 }], [], prefs)).toBeNull();
		const r = whatChanged(ph, [{ t: at(0), value: 7.2 }, { t: at(2), value: 6.0 }], [], prefs)!;
		expect(r.headline).toBe('pH fell from 7.2 → 6 over 2 days.');
	});
});
