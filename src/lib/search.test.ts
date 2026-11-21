import { describe, expect, it } from 'vitest';
import { fold, likePattern, searchTerm } from './search';

describe('search words (#312)', () => {
	it('folds case and accents, so either spelling finds the other', () => {
		expect(fold('Jäger')).toBe('jager');
		expect(fold('CRÈME brûlée')).toBe('creme brulee');
		expect(fold('Ｐｒｉｍｅ')).toBe('prime');
	});
	it('tidies what was typed and takes % and _ literally', () => {
		expect(searchTerm('  java   fern ')).toBe('java fern');
		expect(searchTerm(null)).toBe('');
		expect(searchTerm('x'.repeat(100))).toHaveLength(80);
		expect(likePattern('50%_off')).toBe('%50\\%\\_off%');
	});
});
