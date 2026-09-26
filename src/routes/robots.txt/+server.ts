import { publicSettings } from '$lib/server/public';
import type { RequestHandler } from './$types';

// Only public tank pages may be crawled; the app itself never.
export const GET: RequestHandler = () => {
	const s = publicSettings();
	const lines = ['User-agent: *'];
	if (s.allowPublicPages) {
		lines.push('Allow: /t/', ...(s.publicHomeEnabled ? ['Allow: /public$'] : []), 'Disallow: /');
		if (s.baseUrl) lines.push('', `Sitemap: ${s.baseUrl}/sitemap.xml`);
	} else lines.push('Disallow: /');
	return new Response(lines.join('\n') + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
