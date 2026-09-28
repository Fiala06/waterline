import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

// the lookup writes its copy under DATA_DIR; nothing here needs the database
const dir = mkdtempSync(join(tmpdir(), 'wl-stock-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
vi.mock('./db', () => ({ db: {} }));
vi.mock('./mail', () => ({ getServerSettings: () => ({ stockPhotos: true }) }));
const { commonsFile, failureReason, fetchStockPhoto, freeLicense, lookupName, plainText } = await import('./stock-photos');

describe('lookupName', () => {
	it('looks up the species without a cultivar, "sp." or a note', () => {
		expect(lookupName("Microsorum pteropus 'Trident'", "Java fern 'Trident'")).toBe('Microsorum pteropus');
		expect(lookupName('Anubias sp.', 'Anubias')).toBe('Anubias');
		expect(lookupName("Rotala sp. 'Blood Red'", null)).toBe('Rotala');
		expect(lookupName('Bolbitis heteroclita "Difformis"', null)).toBe('Bolbitis heteroclita');
		expect(lookupName(null, 'Crypt (brown)')).toBe('Crypt');
		expect(lookupName(null, 'Christmas moss')).toBe('Christmas moss');
		expect(lookupName('', '')).toBeNull();
	});
});

describe('freeLicense', () => {
	it('takes free licenses, and leaves out NonCommercial, NoDerivatives and fair use', () => {
		for (const ok of ['CC BY-SA 4.0', 'CC BY 2.0', 'CC0', 'Public domain', 'GFDL', 'CC BY-SA 3.0 de']) expect(freeLicense(ok), ok).toBe(true);
		for (const no of ['CC BY-NC 2.0', 'CC BY-NC-SA 4.0', 'CC BY-ND 4.0', 'Non-free', 'Fair use', '', 'All rights reserved']) expect(freeLicense(no), no).toBe(false);
	});
});

describe('the credit', () => {
	it("is Commons' HTML as text", () => {
		expect(plainText('<a href="//commons.wikimedia.org/wiki/User:Jane">Jane&nbsp;Doe</a> &amp; <span>Co</span>')).toBe('Jane Doe & Co');
	});
	it('takes photos from Commons, never ones only on Wikipedia', () => {
		expect(commonsFile('https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Java_fern.jpg/640px-Java_fern.jpg')).toBe('Java_fern.jpg');
		expect(commonsFile('https://upload.wikimedia.org/wikipedia/commons/a/ab/Neon%20tetra.jpg')).toBe('Neon tetra.jpg');
		expect(commonsFile('https://upload.wikimedia.org/wikipedia/en/1/1a/Poster.jpg')).toBeNull();
		// as Wikipedia gives it now, with where the link came from
		expect(commonsFile('https://upload.wikimedia.org/wikipedia/commons/8/89/Microsorum_pteropus.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled')).toBe(
			'Microsorum_pteropus.jpg'
		);
	});
});

describe('fetchStockPhoto', () => {
	const jpeg = () => sharp({ create: { width: 900, height: 600, channels: 3, background: '#2f7d4a' } }).jpeg().toBuffer();
	function wiki(license: string, opts: { src?: string; status?: number } = {}) {
		const calls: string[] = [];
		const fetcher = (async (url: string) => {
			calls.push(url);
			if (url.includes('/page/summary/')) {
				if (opts.status) return new Response('', { status: opts.status });
				return Response.json({ type: 'standard', originalimage: { source: opts.src ?? 'https://upload.wikimedia.org/wikipedia/commons/4/4b/Java_fern.jpg' } });
			}
			if (url.includes('/w/api.php')) {
				return Response.json({
					query: {
						pages: [
							{
								imageinfo: [
									{
										thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Java_fern.jpg/480px-Java_fern.jpg',
										descriptionurl: 'https://commons.wikimedia.org/wiki/File:Java_fern.jpg',
										extmetadata: { Artist: { value: '<a href="x">Jane Doe</a>' }, LicenseShortName: { value: license }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' } }
									}
								]
							}
						]
					}
				});
			}
			return new Response(new Uint8Array(await jpeg()), { headers: { 'content-type': 'image/jpeg' } });
		}) as unknown as typeof fetch;
		return { fetcher, calls };
	}

	it('keeps a small copy with its credit', async () => {
		const { fetcher, calls } = wiki('CC BY-SA 4.0');
		const found = await fetchStockPhoto('Microsorum pteropus', fetcher);
		expect(found).toMatchObject({ status: 'ok', author: 'Jane Doe', license: 'CC BY-SA 4.0', pageUrl: 'https://commons.wikimedia.org/wiki/File:Java_fern.jpg', width: 480, height: 320 });
		expect(calls[0]).toBe('https://en.wikipedia.org/api/rest_v1/page/summary/Microsorum_pteropus');
		expect(calls[1]).toContain('titles=File%3AJava_fern.jpg');
	});

	it("skips a photo that isn't free, a page with none, and says why", async () => {
		expect(await fetchStockPhoto('Anubias', wiki('CC BY-NC 2.0').fetcher)).toEqual({ status: 'none', reason: 'Its photo isn’t free to use (CC BY-NC 2.0)' });
		expect(await fetchStockPhoto('Nothing', wiki('CC BY-SA 4.0', { status: 404 }).fetcher)).toEqual({ status: 'none', reason: 'No Wikipedia page' });
		expect(await fetchStockPhoto('Poster', wiki('CC BY-SA 4.0', { src: 'https://upload.wikimedia.org/wikipedia/en/1/1a/Poster.jpg' }).fetcher)).toEqual({ status: 'none', reason: 'Its photo isn’t on Commons' });
		expect(await fetchStockPhoto('Down', wiki('CC BY-SA 4.0', { status: 503 }).fetcher)).toEqual({ status: 'failed', reason: 'Wikipedia answered 503' });
	});

	it('says what Wikipedia answered when it refuses, and what went wrong when it can’t be reached', async () => {
		const refused = (async () =>
			new Response('<html><head><style>p{}</style></head><body><p>Please set a user-agent and respect our robot policy.</p></body></html>', { status: 403 })) as unknown as typeof fetch;
		expect(await fetchStockPhoto('Microsorum pteropus', refused)).toEqual({ status: 'failed', reason: 'Wikipedia answered 403: Please set a user-agent and respect our robot policy.' });
		const offline = (async () => {
			throw new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND en.wikipedia.org'), { code: 'ENOTFOUND', hostname: 'en.wikipedia.org' }) });
		}) as unknown as typeof fetch;
		expect(await fetchStockPhoto('Microsorum pteropus', offline)).toEqual({ status: 'failed', reason: 'ENOTFOUND en.wikipedia.org' });
	});

	it('asks Commons for a width it keeps thumbnails at', async () => {
		const { fetcher, calls } = wiki('CC0');
		await fetchStockPhoto('Microsorum pteropus', fetcher);
		expect(calls[1]).toContain('iiurlwidth=500');
	});
});

describe('failureReason', () => {
	it('says a timeout, a refused connection or a certificate problem in a few words', () => {
		expect(failureReason(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }))).toBe('timed out after 10 seconds');
		expect(failureReason(new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) }))).toBe('ECONNREFUSED');
		expect(failureReason(new TypeError('fetch failed', { cause: new Error('unable to get local issuer certificate') }))).toBe('unable to get local issuer certificate');
		expect(failureReason(new Error('Commons answered 429'))).toBe('Commons answered 429');
	});
});
