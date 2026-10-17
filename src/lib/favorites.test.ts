import { describe, expect, it } from 'vitest';
import { cleanFields, favoriteDefaultLabel, favoriteHref, favoriteSub } from './favorites';

describe('cleanFields', () => {
	it('keeps only what the kind takes, tidied', () => {
		expect(cleanFields('water_change', { amountMode: 'percent', amount: ' 40 ', source: 'tap', product: 'x' })).toEqual({
			amountMode: 'percent',
			amount: '40',
			source: 'tap'
		});
		expect(cleanFields('water_change', { amountMode: 'nope', amount: '-3', source: 'well' })).toEqual({});
		expect(cleanFields('dosing', { product: 'Thrive', amount: '5,0', unit: 'mL' })).toEqual({ product: 'Thrive', amount: '5', unit: 'mL' });
		expect(cleanFields('test', { amount: '5' })).toEqual({});
	});
	it('keeps only known maintenance actions', () => {
		expect(cleanFields('maintenance', { actions: ['Trimmed plants', 'Painted the stand'] })).toEqual({ actions: ['Trimmed plants'] });
		expect(cleanFields('maintenance', { actions: 'Scraped glass' })).toEqual({ actions: ['Scraped glass'] });
		expect(cleanFields('maintenance', {})).toEqual({});
	});
});

describe('labels', () => {
	it('names a favorite from its fields', () => {
		expect(favoriteDefaultLabel('water_change', { amountMode: 'percent', amount: '40' }, 'gal')).toBe('40% water change');
		expect(favoriteDefaultLabel('water_change', { amountMode: 'volume', amount: '10' }, 'gal')).toBe('10 gal water change');
		expect(favoriteDefaultLabel('water_change', {}, 'gal')).toBe('Water change');
		expect(favoriteDefaultLabel('dosing', { product: 'Thrive', amount: '5', unit: 'mL' }, 'gal')).toBe('Dose Thrive 5 mL');
		expect(favoriteDefaultLabel('dosing', { product: 'Thrive' }, 'gal')).toBe('Dose Thrive');
		expect(favoriteDefaultLabel('feeding', { food: 'frozen food' }, 'gal')).toBe('Feed frozen food');
		expect(favoriteDefaultLabel('maintenance', { actions: ['Trimmed plants'] }, 'gal')).toBe('Trimmed plants');
		expect(favoriteDefaultLabel('test', {}, 'gal')).toBe('Water test');
		expect(favoriteDefaultLabel('note', {}, 'gal')).toBe('Note or photo');
	});
	it('describes what the form opens with', () => {
		expect(favoriteSub('water_change', { amountMode: 'percent', amount: '40', source: 'tap' }, 'gal')).toBe('40% · Tap');
		expect(favoriteSub('dosing', { product: 'Thrive', amount: '5', unit: 'mL' }, 'gal')).toBe('Thrive · 5 mL');
		expect(favoriteSub('feeding', { food: 'Frozen', amount: '1', unit: 'cube' }, 'gal')).toBe('Frozen · 1 cube');
		expect(favoriteSub('maintenance', { actions: ['Trimmed plants', 'Scraped glass'] }, 'gal')).toBe('Trimmed plants · Scraped glass');
		expect(favoriteSub('test', {}, 'gal')).toBeNull();
	});
});

describe('favoriteHref', () => {
	it('opens the right form with the fields in the address', () => {
		expect(favoriteHref({ kind: 'test', fields: {} }, 't1')).toBe('/entries/test/new?tank=t1');
		expect(favoriteHref({ kind: 'note', fields: {} }, 't1')).toBe('/entries/event/new?tank=t1&category=note');
		expect(favoriteHref({ kind: 'water_change', fields: { amountMode: 'percent', amount: '40', source: 'tap' } }, 't1')).toBe(
			'/entries/event/new?tank=t1&category=water_change&amountMode=percent&amount=40&source=tap'
		);
		expect(favoriteHref({ kind: 'maintenance', fields: { actions: ['Trimmed plants', 'Scraped glass'] } }, 't1', { date: '2026-10-07', time: '08:00' })).toBe(
			'/entries/event/new?tank=t1&category=maintenance&actions=Trimmed+plants&actions=Scraped+glass&date=2026-10-07&time=08%3A00'
		);
	});
	it('leaves the tank to the form when none is chosen', () => {
		expect(favoriteHref({ kind: 'dosing', fields: { product: 'Thrive' } }, null)).toBe('/entries/event/new?category=dosing&product=Thrive');
	});
});
