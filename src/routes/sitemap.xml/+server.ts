import { sitemapEntries } from '$lib/server/public';
import type { RequestHandler } from './$types';

// Public tank pages that allow search engines.
export const GET: RequestHandler = () => {
	const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries()
	.map((e) => `  <url><loc>${esc(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`)
	.join('\n')}
</urlset>
`;
	return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
