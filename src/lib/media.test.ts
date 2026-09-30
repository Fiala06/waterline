import { describe, expect, it } from 'vitest';
import { clampPct, coverPosition, dragFocus } from './media';

describe('the cover photo focus', () => {
	it('is 0–100, and the middle when unset or nonsense', () => {
		expect(coverPosition(null, undefined)).toBe('50% 50%');
		expect(coverPosition(20, 80)).toBe('20% 80%');
		expect(clampPct('-5')).toBe(0);
		expect(clampPct('130')).toBe(100);
		expect(clampPct('33.6')).toBe(34);
		expect(clampPct('abc')).toBe(50);
		expect(clampPct('')).toBe(50);
	});

	it('moves the other way to a drag, by how much of the photo is hidden', () => {
		// a 2000×1000 photo in a 400×160 frame: shown 400×200, so 40 px of it is hidden top to bottom
		const frame = { w: 400, h: 160 };
		const photo = { w: 2000, h: 1000 };
		// down by 20 px shows more of the top: the focus moves up by half
		expect(dragFocus({ x: 50, y: 50 }, { dx: 0, dy: 20 }, frame, photo)).toEqual({ x: 50, y: 0 });
		expect(dragFocus({ x: 50, y: 50 }, { dx: 0, dy: -10 }, frame, photo)).toEqual({ x: 50, y: 75 });
		// nothing hidden side to side: across stays where it is
		expect(dragFocus({ x: 50, y: 50 }, { dx: 100, dy: 0 }, frame, photo).x).toBe(50);
		// never past the edge
		expect(dragFocus({ x: 10, y: 90 }, { dx: 0, dy: -500 }, frame, photo).y).toBe(100);
	});
});
