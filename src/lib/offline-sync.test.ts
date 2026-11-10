import { describe, expect, it } from 'vitest';
import { neverAnswered, syncOutcome, wasPassing } from './offline-sync';

describe('what a queued entry’s post came back as (#225)', () => {
	it('is synced when the form saved', () => {
		expect(syncOutcome({ status: 200 }, { type: 'redirect' })).toEqual({ kind: 'synced' });
		expect(syncOutcome({ status: 200 }, { type: 'success' })).toEqual({ kind: 'synced' });
	});

	it('is refused, with why, when the app itself said no', () => {
		expect(syncOutcome({ status: 400 }, { type: 'failure', data: { errors: {} } })).toEqual({ kind: 'refused', message: "The server couldn't save this entry." });
		expect(syncOutcome({ status: 404 }, { type: 'error' })).toEqual({ kind: 'refused', message: 'Sync failed (404).' });
		expect(syncOutcome({ status: 409 }, { type: 'error' })).toEqual({ kind: 'refused', message: 'Logged by another account. Sign in as them to sync it.' });
		expect(syncOutcome({ status: 413 }, null)).toEqual({ kind: 'refused', message: 'Sync failed (413).' });
	});

	it('waits for the next sync when what went wrong will pass', () => {
		// the session ran out while offline: the post followed the redirect to the sign-in page
		expect(syncOutcome({ status: 200, redirected: true }, null)).toEqual({ kind: 'later' });
		// a proxy answering for a server that's restarting
		expect(syncOutcome({ status: 502 }, null)).toEqual({ kind: 'later' });
		expect(syncOutcome({ status: 504 }, null)).toEqual({ kind: 'later' });
		expect(syncOutcome({ status: 500 }, { type: 'error' })).toEqual({ kind: 'later' });
		// a page that isn't the app's answer (a captive portal)
		expect(syncOutcome({ status: 200 }, null)).toEqual({ kind: 'later' });
	});

	it('tries again what an earlier version gave up on for a passing reason', () => {
		expect(wasPassing('Sync failed (200).')).toBe(true);
		expect(wasPassing('Sync failed (502).')).toBe(true);
		expect(wasPassing('Sync failed (404).')).toBe(false);
		expect(wasPassing("The server couldn't save this entry.")).toBe(false);
		expect(wasPassing(null)).toBe(false);
	});
});

describe('a post that never got an answer (#224)', () => {
	it('is told apart from an error the server answered with', () => {
		expect(neverAnswered({ type: 'error' })).toBe(true);
		expect(neverAnswered({ type: 'error', status: 500 })).toBe(false);
		expect(neverAnswered({ type: 'failure', status: 400 })).toBe(false);
		expect(neverAnswered({ type: 'success', status: 200 })).toBe(false);
	});
});
