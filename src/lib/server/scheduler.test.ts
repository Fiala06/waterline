import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The scheduled run (#211): a step that fails doesn't take the later ones with it.
const dir = mkdtempSync(join(tmpdir(), 'wl-scheduler-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { logs } = await import('./db/schema');
const { runJobs } = await import('./scheduler');

describe('the scheduled run', () => {
	it('runs every step in order, whatever the ones before it did', async () => {
		const ran: string[] = [];
		const failed = await runJobs([
			['first', () => void ran.push('first')],
			[
				'throws',
				() => {
					ran.push('throws');
					throw new Error('database is locked');
				}
			],
			[
				'rejects',
				async () => {
					ran.push('rejects');
					throw new Error('device gone');
				}
			],
			['slow', async () => void (await new Promise((r) => setTimeout(r, 5)), ran.push('slow'))],
			['last', () => void ran.push('last')]
		]);
		expect(ran).toEqual(['first', 'throws', 'rejects', 'slow', 'last']);
		expect(failed).toEqual(['throws', 'rejects']);
		const logged = db.select().from(logs).all().map((l) => l.message);
		expect(logged).toEqual(expect.arrayContaining(["The scheduled run's throws step failed", "The scheduled run's rejects step failed"]));
	});
});
