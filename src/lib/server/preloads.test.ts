import { describe, expect, it } from 'vitest';
import { preloadsInHead } from './preloads';

const page = '<!doctype html>\n<html>\n\t<head>\n\t\t<meta charset="utf-8" />\n\t</head>\n\t<body></body>\n</html>';

describe('preloadsInHead', () => {
	it('moves script preloads into the page, and drops the stylesheet ones', () => {
		const link = [
			'<./_app/immutable/assets/0.D05A82sk.css>; rel="preload"; as="style"; nopush',
			'<./_app/immutable/entry/start.DcSQpGF6.js>; rel="modulepreload"; nopush',
			'<./_app/immutable/nodes/0.DzDt7ncv.js>; rel="modulepreload"; nopush'
		].join(', ');
		const out = preloadsInHead(page, link);
		expect(out.link).toBeNull();
		expect(out.html).toContain('<link rel="modulepreload" href="./_app/immutable/entry/start.DcSQpGF6.js">');
		expect(out.html).toContain('<link rel="modulepreload" href="./_app/immutable/nodes/0.DzDt7ncv.js">');
		expect(out.html).not.toContain('0.D05A82sk.css');
		// in the head, before it closes
		expect(out.html.indexOf('modulepreload')).toBeLessThan(out.html.indexOf('</head>'));
	});

	it('keeps anything else in the header', () => {
		const font = '</_app/immutable/assets/inter.woff2>; rel="preload"; as="font"; type="font/woff2"; crossorigin; nopush';
		const out = preloadsInHead(page, `${font}, </_app/immutable/entry/app.js>; rel="modulepreload"; nopush`);
		expect(out.link).toBe(font);
		expect(out.html).toContain('href="/_app/immutable/entry/app.js"');
	});

	it('writes a safe attribute, and leaves a page without a head alone', () => {
		expect(preloadsInHead(page, '</a.js?x=1&y="2">; rel="modulepreload"').html).toContain('href="/a.js?x=1&amp;y=&quot;2&quot;"');
		expect(preloadsInHead('<p>no head</p>', '</a.js>; rel="modulepreload"')).toEqual({ html: '<p>no head</p>', link: '</a.js>; rel="modulepreload"' });
		expect(preloadsInHead(page, '')).toEqual({ html: page, link: null });
	});
});
