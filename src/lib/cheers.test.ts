import { describe, expect, it } from 'vitest';
import { petAnniversaries, tankMilestone, testMilestone, zeroStreak } from './cheers';

describe('zeroStreak', () => {
	it('counts tests in a row with ammonia and nitrite both at 0, newest first', () => {
		const zero = { nh3: 0, no2: 0 };
		expect(zeroStreak([zero, zero, zero, { nh3: 0.25, no2: 0 }, zero])).toBe(3);
		// a test without both is passed over, not counted
		expect(zeroStreak([zero, { nh3: 0 }, {}, zero])).toBe(2);
		expect(zeroStreak([{ nh3: 0, no2: 0.1 }, zero])).toBe(0);
		expect(zeroStreak([])).toBe(0);
	});
});

describe('milestones', () => {
	it("the tank's round days and birthdays, for three days", () => {
		// set up Aug 23: day 100 is Nov 30
		expect(tankMilestone('Betta Tank', '2026-08-23', '2026-11-30')).toEqual({ key: 'tank-d100', text: 'Betta Tank turns 100 days 🎉' });
		expect(tankMilestone('Betta Tank', '2026-08-23', '2026-12-02')?.key).toBe('tank-d100');
		expect(tankMilestone('Betta Tank', '2026-08-23', '2026-12-03')).toBeNull();
		expect(tankMilestone('Betta Tank', '2026-08-23', '2027-08-23')).toEqual({ key: 'tank-y1', text: 'Betta Tank turns 1 year 🎉' });
		expect(tankMilestone('Betta Tank', '2024-08-23', '2026-08-24')?.text).toBe('Betta Tank turns 2 years 🎉');
		expect(tankMilestone('Betta Tank', null, '2026-11-30')).toBeNull();
		// over New Year: still the birthday just gone
		expect(tankMilestone('Reef', '2025-12-31', '2027-01-01')?.text).toBe('Reef turns 1 year 🎉');
		expect(tankMilestone('Betta Tank', '2026-12-01', '2026-11-30')).toBeNull();
	});

	it("a named pet's anniversaries", () => {
		const pets = [
			{ name: 'Darwin', added: '2025-10-01' },
			{ name: 'Nemo', added: '2024-09-29' },
			{ name: 'New', added: '2026-10-01' }
		];
		expect(petAnniversaries(pets, '2026-10-01')).toEqual([
			{ key: 'pet-Darwin-1', text: 'Darwin has lived with you a year 🎂' },
			{ key: 'pet-Nemo-2', text: 'Nemo has lived with you 2 years 🎂' }
		]);
		expect(petAnniversaries(pets, '2026-10-04')).toEqual([]);
	});

	it('round numbers of water tests, while the latest is recent', () => {
		expect(testMilestone(50, '2026-10-01', '2026-10-01')).toEqual({ key: 'tests-50', text: 'Your 50th water test. 🧪' });
		expect(testMilestone(101, '2026-10-01', '2026-10-01')).toBeNull();
		expect(testMilestone(50, '2026-09-20', '2026-10-01')).toBeNull();
		expect(testMilestone(1000, '2026-10-01', '2026-10-02')?.text).toBe('Your 1000th water test. 🧪');
	});
});
