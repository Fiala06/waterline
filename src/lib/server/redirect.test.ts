import { describe, expect, it } from 'vitest';
import { safeReturn } from './redirect';

describe('safeReturn', () => {
	it('keeps same-site paths', () => {
		expect(safeReturn('/tasks?tank=1')).toBe('/tasks?tank=1');
		expect(safeReturn('/')).toBe('/');
	});

	it('refuses anything that could leave the site', () => {
		for (const bad of ['//evil.example', '/\\evil.example', '/\t/evil.example', '/\n/evil.example', 'https://evil.example', 'evil', '', null]) {
			expect(safeReturn(bad, '/home')).toBe('/home');
		}
	});
});
