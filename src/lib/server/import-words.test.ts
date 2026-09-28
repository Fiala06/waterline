import { describe, expect, it } from 'vitest';
import { readImport, wordMapOf } from './import-rows';

const ctx = { prefs: { unitSystem: 'imperial' as const, hardnessUnit: 'dgh' as const }, water: 'fresh' as const, today: '2026-09-28' };
const csv = 'Name,Position,Status\nBolbitis,Epiphyte,New\nFissidens,Epiphyte,new\nAponogeton,Midground,Struggling\nWater lettuce,On top,Healthy\n';

describe('words a file uses that Waterline does not know', () => {
	it('lists each once, with how many rows have it', () => {
		const r = readImport('plants', csv, ctx);
		if ('error' in r) throw new Error(r.error);
		expect(r.words.map((w) => [w.label, w.word, w.rows, w.chosen])).toEqual([
			['Position', 'On top', 1, null],
			['Status', 'New', 2, null],
			['Status', 'Struggling', 1, null]
		]);
		expect(r.words[1].options.map((o) => o.value)).toEqual(['thriving', 'melting', 'algae', 'other']);
		expect(r.rows.filter((x) => x.value)).toHaveLength(0);
	});

	it('reads every row with a word as chosen', () => {
		const form = new FormData();
		form.set('word.status.new', 'thriving');
		form.set('word.status.struggling', 'melting');
		form.set('word.position.on top', 'floating');
		form.set('word.status.bogus', 'nonsense'); // not a real choice: left out
		const words = wordMapOf('plants', form);
		expect(words).toEqual({ status: { new: 'thriving', struggling: 'melting' }, position: { 'on top': 'floating' } });
		const r = readImport('plants', csv, { ...ctx, words });
		if ('error' in r) throw new Error(r.error);
		expect(r.rows.map((x) => (x.value as { status?: string } | null)?.status ?? null)).toEqual(['thriving', 'thriving', 'melting', 'thriving']);
		expect(r.rows[3].value).toMatchObject({ position: 'floating' });
		expect(r.words.every((w) => w.chosen)).toBe(true);
	});
});

describe('floating plants', () => {
	it('Floating is a position of its own', () => {
		const r = readImport('plants', 'Name,Position\nWater lettuce,Floating\nFrogbit,floaters\n', ctx);
		if ('error' in r) throw new Error(r.error);
		expect(r.rows.map((x) => (x.value as { position: string }).position)).toEqual(['floating', 'floating']);
	});
});
