import { describe, expect, it } from 'vitest';
import { availableUpdate, checkForUpdate, newerReleases, pageOf, projectPage } from './updates';

const md = (...versions: string[]) => versions.map((v) => `## ${v} · 2026-12-01\n\n- **Something new** in ${v}`).join('\n\n');
const reply = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch;

describe('newerReleases', () => {
	it('keeps only releases after the running one, newest first', () => {
		expect(newerReleases(md('1.1.0', '1.2.0', '1.3.0', '1.0.0'), '1.1.0').map((r) => r.version)).toEqual(['1.3.0', '1.2.0']);
		expect(newerReleases(md('1.1.0', '1.0.0'), '1.1.0')).toEqual([]);
	});
});

describe('availableUpdate', () => {
	it('tells what the last check found, and keeps it through a failed check', async () => {
		const now = Date.now();
		await checkForUpdate(reply(md('99.1.0', '99.0.0')), now);
		expect(availableUpdate(now)).toMatchObject({ version: '99.1', releases: [{ version: '99.1.0' }, { version: '99.0.0' }], more: 0 });
		await checkForUpdate(reply('Not found', 404), now);
		expect(availableUpdate(now)?.version).toBe('99.1');
		await checkForUpdate(reply(md('0.9.0')), now);
		expect(availableUpdate(now)).toBeNull();
	});
});

describe('availableUpdate, far behind', () => {
	it('shows the newest three releases and counts the rest', async () => {
		const now = Date.now();
		await checkForUpdate(reply(md('99.4.0', '99.3.0', '99.2.0', '99.1.0', '99.0.0')), now);
		const update = availableUpdate(now)!;
		expect(update.releases.map((r) => r.version)).toEqual(['99.4.0', '99.3.0', '99.2.0']);
		expect(update.more).toBe(2);
	});
});

describe('pageOf', () => {
	it("links a raw changelog to its page on GitHub", () => {
		expect(pageOf('https://raw.githubusercontent.com/Fiala06/waterline/main/CHANGELOG.md')).toBe('https://github.com/Fiala06/waterline/blob/main/CHANGELOG.md');
		expect(pageOf('https://example.com/CHANGELOG.md')).toBe('https://example.com/CHANGELOG.md');
	});
});

describe('projectPage', () => {
	it("is the repo the check reads from, or upstream's", () => {
		expect(projectPage()).toBe('https://github.com/Fiala06/waterline');
	});
});
