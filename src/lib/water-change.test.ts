import { describe, expect, it } from 'vitest';
import { percentOfTank, volumeLimitError, volumeOverTank } from './water-change';
import { toStored, type UnitPrefs } from './units';

const IMP: UnitPrefs = { unitSystem: 'imperial', hardnessUnit: 'dgh' };

describe('water change limits (#308)', () => {
	it('takes exactly the whole tank and refuses more', () => {
		expect(volumeOverTank(151.4, 151.4)).toBe(false);
		expect(volumeOverTank(189.3, 151.4)).toBe(true); // 50 gal from a 40 gal tank
	});

	it('allows the rounding of a displayed volume', () => {
		const tank = toStored(40, 'volume', IMP);
		// typed as shown to one decimal, in either system
		expect(volumeOverTank(toStored(40.0, 'volume', IMP), tank)).toBe(false);
		expect(volumeOverTank(151.4, tank)).toBe(false);
		expect(volumeOverTank(152, tank)).toBe(false);
		expect(volumeOverTank(153, tank)).toBe(true);
	});

	it('takes any volume when the tank size is not known', () => {
		expect(volumeOverTank(500, null)).toBe(false);
		expect(volumeOverTank(500, undefined)).toBe(false);
		expect(volumeOverTank(500, 0)).toBe(false);
		expect(percentOfTank(500, null)).toBeNull();
	});

	it('works out the percent, never above 100', () => {
		expect(percentOfTank(37.85, 151.4)).toBe(25);
		expect(percentOfTank(100, 100)).toBe(100);
		expect(percentOfTank(100.4, 100)).toBe(100);
		expect(percentOfTank(10, 30)).toBe(33.3);
	});

	it('names the limit in the keeper’s units', () => {
		expect(volumeLimitError('40', 'gal')).toBe("Enter up to 40 gal, the tank's water volume.");
	});
});
