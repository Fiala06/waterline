import { publicSettings } from '$lib/server/public';
import type { RequestHandler } from './$types';

// Only the public surface may be crawled, as the admin turned it on: public
// tank pages, the directory of them, and the product homepage (#300). The app itself never.
export const GET: RequestHandler = () => {
	const s = publicSettings();
	const lines = ['User-agent: *'];
	const allow = [
		...(s.allowPublicPages ? ['Allow: /t/', ...(s.publicHomeEnabled ? ['Allow: /public$'] : [])] : []),
		...(s.landingEnabled ? ['Allow: /welcome$'] : [])
	];
	if (allow.length) {
		lines.push(...allow, 'Disallow: /');
		if (s.baseUrl) lines.push('', `Sitemap: ${s.baseUrl}/sitemap.xml`);
	} else lines.push('Disallow: /');
	return new Response(lines.join('\n') + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
