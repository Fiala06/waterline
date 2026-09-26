import { describe, expect, it } from 'vitest';
import { paramStatus, rangeText, statusLong, statusMedium, statusShort } from './status';
import { fToC } from './units';

const nitrate = { min: 5, max: 20 }; // margin 1.5
const ammonia = { min: 0, max: 0.25 };
const kh = { min: 2, max: 5 }; // margin 0.3

describe('paramStatus', () => {
	it('flags values outside the range', () => {
		expect(paramStatus(35, nitrate)).toEqual({ level: 'bad', direction: 'high' });
		expect(paramStatus(4.9, nitrate)).toEqual({ level: 'bad', direction: 'low' });
	});

	it('treats the bounds themselves as in range', () => {
		expect(paramStatus(5, nitrate).level).not.toBe('bad');
		expect(paramStatus(20, nitrate).level).not.toBe('bad');
	});

	it('flags values within 10% of a bound as near', () => {
		expect(paramStatus(2, kh)).toEqual({ level: 'warn', direction: 'low' });
		expect(paramStatus(2.29, kh)).toEqual({ level: 'warn', direction: 'low' });
		expect(paramStatus(4.8, kh)).toEqual({ level: 'warn', direction: 'high' });
		expect(paramStatus(19, nitrate)).toEqual({ level: 'warn', direction: 'high' });
	});

	it('is ok exactly at the 10% margin and in the middle', () => {
		expect(paramStatus(2.3, kh).level).toBe('ok');
		expect(paramStatus(12, nitrate).level).toBe('ok');
	});

	it('never shows near when min is 0', () => {
		expect(paramStatus(0, ammonia)).toEqual({ level: 'ok', direction: null });
		expect(paramStatus(0.25, ammonia)).toEqual({ level: 'ok', direction: null });
		expect(paramStatus(0.24, ammonia).level).toBe('ok');
		expect(paramStatus(0.5, ammonia)).toEqual({ level: 'bad', direction: 'high' });
	});

	it('flags negative readings when min is 0', () => {
		expect(paramStatus(-0.1, ammonia)).toEqual({ level: 'bad', direction: 'low' });
	});

	it('returns none without a reading', () => {
		expect(paramStatus(null, nitrate).level).toBe('none');
		expect(paramStatus(undefined, nitrate).level).toBe('none');
		expect(paramStatus(NaN, nitrate).level).toBe('none');
	});

	it('handles open-ended and missing targets', () => {
		expect(paramStatus(100, { min: null, max: null }).level).toBe('ok');
		expect(paramStatus(0.3, { min: null, max: 0.2 })).toEqual({ level: 'bad', direction: 'high' });
		expect(paramStatus(0.01, { min: 0.05, max: null })).toEqual({ level: 'bad', direction: 'low' });
		// near needs both bounds
		expect(paramStatus(0.05, { min: 0.05, max: null }).level).toBe('ok');
	});

	it('does not flag readings that round-trip through °F', () => {
		const temp = { min: fToC(74), max: fToC(80) };
		expect(paramStatus(fToC(80), temp).level).not.toBe('bad');
		expect(paramStatus(fToC(74), temp).level).not.toBe('bad');
		expect(paramStatus(fToC(77), temp).level).toBe('ok');
	});

	it('does not divide by a zero-width range', () => {
		expect(paramStatus(7, { min: 7, max: 7 }).level).toBe('ok');
	});
});

describe('labels', () => {
	it('never relies on color alone', () => {
		expect(statusShort({ level: 'ok', direction: null })).toBe('✓ OK');
		expect(statusShort({ level: 'warn', direction: 'low' })).toBe('▲ Near low');
		expect(statusShort({ level: 'warn', direction: 'high' })).toBe('▲ Near high');
		expect(statusShort({ level: 'bad', direction: 'high' })).toBe('✕ High');
		expect(statusShort({ level: 'bad', direction: 'low' })).toBe('✕ Low');
		expect(statusShort({ level: 'none', direction: null })).toBe('– No data');
		expect(statusMedium({ level: 'warn', direction: 'low' })).toBe('▲ Near limit');
		expect(statusLong({ level: 'bad', direction: 'high' }, '5–20 ppm')).toBe(
			'✕ Above target 5–20 ppm'
		);
		expect(statusLong({ level: 'bad', direction: 'low' }, '5–20 ppm')).toBe(
			'✕ Below target 5–20 ppm'
		);
	});

	it('formats ranges', () => {
		expect(rangeText('5', '20', 'ppm')).toBe('5–20 ppm');
		expect(rangeText('0', '0.25', 'ppm', true)).toBe('≤ 0.25 ppm');
		expect(rangeText('6.5', '7.5', '')).toBe('6.5–7.5');
		expect(rangeText('2', null, 'dKH')).toBe('≥ 2 dKH');
		expect(rangeText(null, null, 'ppm')).toBe('');
	});
});
