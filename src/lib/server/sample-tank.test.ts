import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// a database of its own, with every migration
const dir = mkdtempSync(join(tmpdir(), 'wl-sample-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { events, expenses, publicPages, tanks, tasks, tests, users } = await import('./db/schema');
const { sampleTank } = await import('./sample-tank');

const counts = () => Object.fromEntries(Object.entries({ events, expenses, publicPages, tanks, tasks, tests, users }).map(([k, t]) => [k, db.select().from(t).all().length]));

describe('the sample tank (#301)', () => {
	it('shows readings, a trend with care on it, the care log, reminders and spending', () => {
		const s = sampleTank({ chart: '30d' });
		expect(s.view.name).toBe('Riverbed 30');
		expect(s.view.keeper).toBeTruthy();
		expect(s.detail.attention.length).toBeGreaterThan(0); // nitrate is high: the water change is due
		expect(s.detail.lanes.length).toBeGreaterThan(0);
		expect(JSON.stringify(s.detail)).toContain('Water change');
		expect(s.spending.total).toMatch(/^\$/);
		expect(s.spending.byCategory[0].label).toBeTruthy();
	});

	it('saves nothing: the database is as it was, and no account can sign in as it', () => {
		const before = counts();
		sampleTank({ chart: '90d' }, new Date('2030-01-01T12:00:00Z'));
		expect(counts()).toEqual(before);
		expect(db.select().from(users).all().some((u) => u.email.includes('sample'))).toBe(false);
	});

	it('is built once a day for each chart range', () => {
		const now = new Date('2030-02-01T15:00:00Z');
		expect(sampleTank({ chart: '30d' }, now)).toBe(sampleTank({ chart: '30d' }, now));
	});
});
