import { describe, expect, it } from 'vitest';
import { plugText, wattsText } from './plugs';

describe('a smart plug in words (#203)', () => {
	it('says on with the power, off, not answering, or no reading', () => {
		expect(plugText({ on: true, watts: 4.24, lastError: null })).toEqual({ text: '● On · 4.2 W', level: 'ok' });
		expect(plugText({ on: true, watts: null, lastError: null }).text).toBe('● On');
		expect(plugText({ on: false, watts: 0, lastError: null })).toEqual({ text: '○ Off', level: 'warn' });
		expect(plugText({ on: true, watts: 3, lastError: "The plug couldn't be reached" })).toEqual({ text: '✕ Not answering', level: 'bad' });
		expect(plugText({ on: null, watts: null, lastError: null }).text).toBe('– No reading yet');
	});
	it('rounds the watts', () => {
		expect(wattsText(0)).toBe('0 W');
		expect(wattsText(12.6)).toBe('13 W');
		expect(wattsText(0.35)).toBe('0.4 W');
	});
});
