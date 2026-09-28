import { error, json } from '@sveltejs/kit';
import sharp from 'sharp';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// DEVELOPMENT ONLY (AUTH_DEV_LOGIN=true): Wikipedia and Commons as the species
// photos read them (with the ?utm_source=… Wikipedia adds), for the end-to-end tests (STOCK_PHOTO_WIKI and
// STOCK_PHOTO_COMMONS point here). Two species have a free photo, one has a
// photo that isn't free, and anything else has no page.
const PAGES: Record<string, { file: string; license: string; color: string }> = {
	Microsorum_pteropus: { file: 'Java_fern.jpg', license: 'CC BY-SA 4.0', color: '#2f7d4a' },
	Paracheirodon_innesi: { file: 'Neon_tetra.jpg', license: 'CC BY 2.0', color: '#2a5fa8' },
	Anubias: { file: 'Anubias_nonfree.jpg', license: 'CC BY-NC 2.0', color: '#556b2f' }
};
// files found by searching Commons: a cultivar's (no Wikipedia page)
const FILES: { file: string; license: string; color: string }[] = [{ file: 'Microsorum_pteropus_Trident.jpg', license: 'CC BY 4.0', color: '#7a4ab0' }];
const ALL = [...Object.values(PAGES), ...FILES];

export const GET: RequestHandler = async ({ params, url }) => {
	if (env.AUTH_DEV_LOGIN !== 'true') error(404);
	const base = `${url.origin}/dev/wiki`;
	const path = params.path;
	const summary = /^api\/rest_v1\/page\/summary\/(.+)$/.exec(path);
	if (summary) {
		const p = PAGES[decodeURIComponent(summary[1])];
		if (!p) error(404, 'Not found');
		return json({ type: 'standard', originalimage: { source: `${base}/wikipedia/commons/a/ab/${p.file}?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled` } });
	}
	if (path === 'w/api.php' && url.searchParams.get('list') === 'search') {
		const q = (url.searchParams.get('srsearch') ?? '').toLowerCase();
		const hits = q.includes('trident') ? ['File:Microsorum pteropus.jpg', ...FILES.map((f) => `File:${f.file}`)] : [];
		return json({ query: { search: hits.map((title) => ({ title })) } });
	}
	if (path === 'w/api.php') {
		const file = (url.searchParams.get('titles') ?? '').replace(/^File:/, '');
		const p = ALL.find((x) => x.file === file);
		if (!p) return json({ query: { pages: [{ missing: true }] } });
		return json({
			query: {
				pages: [
					{
						imageinfo: [
							{
								thumburl: `${base}/thumb/${file}`,
								descriptionurl: `https://commons.wikimedia.org/wiki/File:${file}`,
								extmetadata: {
									Artist: { value: '<a href="https://commons.wikimedia.org/wiki/User:Jane">Jane Doe</a>' },
									LicenseShortName: { value: p.license },
									LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' }
								}
							}
						]
					}
				]
			}
		});
	}
	const thumb = /^thumb\/(.+)$/.exec(path);
	const p = thumb && ALL.find((x) => x.file === thumb[1]);
	if (p) {
		const img = await sharp({ create: { width: 640, height: 480, channels: 3, background: p.color } }).jpeg().toBuffer();
		return new Response(new Uint8Array(img), { headers: { 'content-type': 'image/jpeg' } });
	}
	error(404, 'Not found');
};
