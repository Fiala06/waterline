import { describe, expect, it, vi } from 'vitest';

// the pure parts only: no database
vi.mock('./db', () => ({ db: {} }));
const { forumSummary, testsCsv, zoneLabel } = await import('./public-detail');
type Detail = Parameters<typeof testsCsv>[0];

const detail = (over: Partial<Detail> = {}): Detail =>
	({
		details: false,
		question: null,
		dayNumber: 52,
		units: 'Dates in the keeper’s time zone · temperature °F',
		attention: [],
		steady: [],
		setup: [],
		schedules: [],
		gear: [],
		routine: null,
		animals: [],
		losses: [],
		plants: [],
		warnings: [],
		markers: { waterChanges: [], doses: [], changes: [] },
		testLog: {
			columns: [
				{ id: 'a', name: 'Ammonia', unit: 'ppm' },
				{ id: 'b', name: 'pH', unit: '' }
			],
			rows: [
				{ id: '2', when: 'Oct 13 · 7:12 PM', cells: [{ v: '1', level: 'bad', status: '✕ High' }, null], note: 'after the "new" wood, 2nd change', changeBefore: true },
				{ id: '1', when: 'Oct 9 · 11:28 AM', cells: [{ v: '0', level: 'ok', status: '✓ OK' }, { v: '6.4', level: 'ok', status: '✓ OK' }], note: null, changeBefore: false }
			],
			more: 0
		},
		...over
	}) as unknown as Detail;

describe('testsCsv', () => {
	it('is oldest first, a column per parameter, with notes only when shared', () => {
		const lines = testsCsv(detail()).trim().split('\r\n');
		expect(lines[0]).toBe('When,Ammonia (ppm),pH,Water change before');
		expect(lines[1]).toBe('Oct 9 11:28 AM,0,6.4,');
		expect(lines[2]).toBe('Oct 13 7:12 PM,1,,yes');
	});
	it('quotes a note with commas and quotes', () => {
		const lines = testsCsv(detail({ details: true })).trim().split('\r\n');
		expect(lines[0]).toBe('When,Ammonia (ppm),pH,Note,Water change before');
		expect(lines[2]).toBe('Oct 13 7:12 PM,1,,"after the ""new"" wood, 2nd change",yes');
	});
});

describe('forumSummary', () => {
	it('leads with the question and ends with the link', () => {
		const text = forumSummary(detail({ question: 'Why does ammonia spike?' }), { name: 'Betta Tank', type: 'Planted', volume: '14 gal', keeper: 'Cory', url: 'https://x.test/t/betta', periodTitle: 'the last 30 days' });
		const lines = text.trim().split('\n');
		expect(lines[0]).toBe('Betta Tank · Planted · 14 gal · day 52');
		expect(lines[3]).toBe('Why does ammonia spike?');
		expect(text).toContain('- Oct 13 · 7:12 PM: Ammonia 1');
		expect(lines.at(-1)).toBe('Full log, charts and photos: https://x.test/t/betta');
	});
});

describe('zoneLabel', () => {
	it('names the zone, or falls back to its id', () => {
		expect(zoneLabel('America/Los_Angeles', new Date('2026-07-01T12:00:00Z'))).toBe('PDT');
		expect(zoneLabel('Not/AZone')).toBe('Not/AZone');
	});
});
