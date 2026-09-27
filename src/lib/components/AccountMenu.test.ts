import { describe, expect, it } from 'vitest';
import { initialsOf } from './AccountMenu.svelte';

describe('initialsOf', () => {
	it("takes the first and last names' letters", () => {
		expect(initialsOf('Cory Fiala')).toBe('CF');
		expect(initialsOf('ana maria de souza')).toBe('AS');
		expect(initialsOf('Admin')).toBe('A');
	});

	it("uses the address when there's no name", () => {
		expect(initialsOf('', 'jo.smith@example.com')).toBe('JS');
		expect(initialsOf('  ', 'kim@example.com')).toBe('K');
		expect(initialsOf('', '')).toBe('?');
	});
});
