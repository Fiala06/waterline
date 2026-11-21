import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// About this server (#302): the services listed are the ones this server has on,
// worked out from its settings, beside what its admin wrote.
const dir = mkdtempSync(join(tmpdir(), 'wl-about-'));
const env: Record<string, string> = { DATA_DIR: dir };
vi.mock('$env/dynamic/private', () => ({ env }));
const { db } = await import('./db');
const { serverSettings } = await import('./db/schema');
const { getServerSettings } = await import('./mail');
const { aboutServer } = await import('./about');

const set = (patch: Partial<typeof serverSettings.$inferInsert>) => {
	getServerSettings();
	db.update(serverSettings).set(patch).run();
};
const names = () => aboutServer().services.map((s) => s.name);

describe('about this server (#302)', () => {
	it('names only the services this server uses', () => {
		set({ emailProvider: null, ga4Id: null, allowPublicPages: true, stockPhotos: false, barcodeLookup: false, speciesCare: false, updateCheck: false });
		expect(names()).toEqual(['Your browser’s push service', 'ntfy', 'AI assistants']);

		set({ emailProvider: 'mailgun', mailgunRegion: 'eu', mailgunDomain: 'mg.example.com', sender: 'tanks@example.com', ga4Id: 'G-ABC1234', consentBanner: true, stockPhotos: true, updateCheck: true });
		// a Mailgun key isn't set, so email isn't working: not listed
		expect(names()).not.toContain('Mailgun (EU region)');
		const all = aboutServer().services;
		expect(all.find((s) => s.name === 'Google Analytics')?.what).toBe('On public tank pages only, never inside the app, and only after a visitor agrees.');
		expect(names()).toEqual(expect.arrayContaining(['Wikimedia Commons', 'GitHub']));

		// no public pages: no analytics, whatever the ID
		set({ allowPublicPages: false });
		expect(names()).not.toContain('Google Analytics');
		// UPDATE_CHECK=off wins over the switch
		env.UPDATE_CHECK = 'off';
		expect(names()).not.toContain('GitHub');
		delete env.UPDATE_CHECK;
	});

	it('gives the admin’s words as they wrote them, and nothing when they wrote nothing', () => {
		set({ aboutOperator: null, aboutContact: null, aboutTerms: null, landingAccess: null });
		expect(aboutServer()).toMatchObject({ operator: null, contact: null, terms: null, access: null });
		set({ aboutOperator: 'Run by Sam', aboutContact: 'sam@example.com', aboutTerms: 'Free in beta.\n\nBackups nightly.', aboutUpdatedAt: '2026-11-21T10:00:00.000Z' });
		expect(aboutServer()).toMatchObject({ operator: 'Run by Sam', contact: 'sam@example.com', terms: 'Free in beta.\n\nBackups nightly.', updatedAt: '2026-11-21T10:00:00.000Z' });
	});
});
