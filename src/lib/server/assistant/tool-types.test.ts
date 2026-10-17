import { describe, expect, it } from 'vitest';
import { days, whole } from './tool-types';

// the arguments every tool reads the same way
describe('days', () => {
	it('is the fallback when left out, blank or not a number', () => {
		expect(days({}, 90, 3650)).toBe(90);
		expect(days({ days: null }, 90, 3650)).toBe(90);
		expect(days({ days: '' }, 90, 3650)).toBe(90);
		expect(days({ days: 'abc' }, 90, 3650)).toBe(90);
		expect(days({ days: NaN }, 90, 3650)).toBe(90);
	});

	it('is a whole number from 1 to the maximum', () => {
		expect(days({ days: 0 }, 90, 3650)).toBe(1);
		expect(days({ days: -5 }, 90, 3650)).toBe(1);
		expect(days({ days: 10.6 }, 90, 3650)).toBe(11);
		expect(days({ days: '30' }, 90, 3650)).toBe(30);
		expect(days({ days: 99999 }, 90, 3650)).toBe(3650);
	});
});

describe('whole', () => {
	it('keeps a number between its bounds and falls back on nothing', () => {
		expect(whole('0', 50, 0, 200)).toBe(0);
		expect(whole('', 50, 0, 200)).toBe(50);
		expect(whole(undefined, 50, 0, 200)).toBe(50);
		expect(whole('500', 50, 0, 200)).toBe(200);
	});
});
