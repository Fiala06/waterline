// SvelteKit tells the browser what to fetch early in a Link header: every
// script a page needs. On the bigger pages that's over 3 KB, and with the
// rest of the headers a response can pass nginx's default 4 KB limit, so a
// proxy in front (Nginx Proxy Manager, say) answers 502 Bad Gateway instead of
// the page. The same hints work as tags in the page's <head>, with no limit.

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * The page with its script preloads as <link> tags, and what's left of the
 * Link header (null for nothing). Stylesheet preloads go: the page links its
 * stylesheets already. Anything else stays in the header.
 */
export function preloadsInHead(html: string, link: string): { html: string; link: string | null } {
	const tags: string[] = [];
	const keep: string[] = [];
	for (const entry of link.split(/,\s*(?=<)/)) {
		const m = /^<([^>]*)>\s*;(.*)$/.exec(entry.trim());
		if (!m) {
			if (entry.trim()) keep.push(entry.trim());
			continue;
		}
		const params = m[2];
		if (/\brel="?modulepreload"?/.test(params)) tags.push(`<link rel="modulepreload" href="${attr(m[1])}">`);
		else if (!(/\brel="?preload"?/.test(params) && /\bas="?style"?/.test(params))) keep.push(entry.trim());
	}
	const at = html.indexOf('</head>');
	// nowhere to put them: leave the page as it was
	if (at < 0) return { html, link: link.trim() || null };
	return {
		html: tags.length ? `${html.slice(0, at)}\t${tags.join('\n\t\t')}\n\t${html.slice(at)}` : html,
		link: keep.length ? keep.join(', ') : null
	};
}
