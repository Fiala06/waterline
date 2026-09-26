// Share images (S1–S3): 1200×630 PNGs for Open Graph / Twitter cards, made
// with satori (layout → SVG) and resvg (SVG → PNG). Key content stays inside
// the centered 630×630 safe area. Cached on disk by version.
import { Resvg } from '@resvg/resvg-js';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import satori from 'satori';
import sharp from 'sharp';
import { env } from '$env/dynamic/private';
import type { Photo } from './photos';
import { photoFilePath } from './photos';
import type { PublicView } from './public';

const W = 1200;
const H = 630;
const C = { bg: '#0c1a1f', surface: '#13262c', border: '#24414a', text: '#e6f0f0', muted: '#9fb4b8', accent: '#4fc4bd', ok: '#6fd39a', warn: '#e8c060', bad: '#f08a78' };

const require = createRequire(import.meta.url);
let fonts: { name: string; data: Buffer; weight: 400 | 600 | 700; style: 'normal' }[] | null = null;
function loadFonts() {
	if (!fonts) {
		const f = (w: 400 | 600 | 700) => ({
			name: 'Inter',
			data: readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${w}-normal.woff`)),
			weight: w,
			style: 'normal' as const
		});
		fonts = [f(400), f(600), f(700)];
	}
	return fonts;
}

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: (Node | string | null | false)[]): Node => ({
	type,
	props: { style: { display: 'flex', ...style }, children: children.filter(Boolean) }
});
const img = (src: string, style: Record<string, unknown>): Node => ({ type: 'img', props: { src, style } });

const cacheDir = () => join(env.DATA_DIR ?? './data', 'og');
// Bump when the card layout changes so cached images are rebuilt.
const TEMPLATE = 2;

async function photoData(p: Photo, width: number, height: number) {
	const buf = await sharp(photoFilePath(p, 'full')).resize(width, height, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer();
	return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

// Mark 2c as an inline SVG image
const MARK = `data:image/svg+xml;base64,${Buffer.from(
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><defs><clipPath id="w"><circle cx="28" cy="28" r="19"/></clipPath></defs><rect x="0" y="31" width="56" height="30" fill="${C.accent}" clip-path="url(#w)"/><circle cx="28" cy="28" r="24.5" fill="none" stroke="${C.text}" stroke-width="3.5"/></svg>`
).toString('base64')}`;

async function render(node: Node) {
	const svg = await satori(node as never, { width: W, height: H, fonts: loadFonts() });
	return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}

async function cached(key: string, make: () => Promise<Buffer | Uint8Array>) {
	const dir = cacheDir();
	const file = join(dir, `v${TEMPLATE}-${key.replace(/[^a-z0-9-]/gi, '_')}.png`);
	if (existsSync(file)) return readFileSync(file);
	mkdirSync(dir, { recursive: true });
	const png = Buffer.from(await make());
	writeFileSync(file, png);
	return png;
}

const levelColor = (l: string) => (l === 'bad' ? C.bad : l === 'warn' ? C.warn : l === 'ok' ? C.ok : C.muted);
// Status symbols drawn as images: the share-image font has no ✓ ▲ ✕ glyphs.
function statusIcon(level: string, size = 20) {
	const c = levelColor(level);
	const shape =
		level === 'ok'
			? `<path d="M4 10.5l4 4 8-9" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`
			: level === 'warn'
				? `<path d="M10 3l8 14H2z" fill="${c}"/>`
				: level === 'bad'
					? `<path d="M5 5l10 10M15 5L5 15" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/>`
					: `<path d="M5 10h10" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/>`;
	const src = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">${shape}</svg>`).toString('base64')}`;
	return img(src, { width: size, height: size });
}
const statusWord = (level: string, s: string) => (level === 'ok' ? 'In range' : s.replace(/^[✓▲✕–]\s*/, ''));
const ORDER = ['ph', 'no3', 'temp', 'nh3', 'no2', 'kh', 'gh'];
const order = (key: string) => (ORDER.includes(key) ? ORDER.indexOf(key) : ORDER.length);

/** S1 (with cover photo and readings) or S3 (fallback, no photo). */
export async function tankCard(view: PublicView, opts: { cover: Photo | null; plain: boolean; host: string; version: string }) {
	return cached(`t-${view.slug}-${opts.version}`, async () => {
		if (opts.cover && opts.plain) {
			return render(h('div', { width: W, height: H }, img(await photoData(opts.cover, W, H), { width: W, height: H })));
		}
		const sub = [view.type, view.volume, view.since ? `since ${view.since}` : null].filter(Boolean).join(' · ');
		// Problems first, then the usual headline numbers.
		const rank = (r: PublicView['readings'][number]) => (r.level === 'bad' ? 0 : r.level === 'warn' ? 1 : 2);
		const readings = [...view.readings]
			.sort((a, b) => rank(a) - rank(b) || order(a.key) - order(b.key))
			.slice(0, 3);
		const url = `${opts.host}/t/${view.slug}${view.tested ? ` · tested ${view.tested}` : ''}`;
		const body = h(
			'div',
			{ flexDirection: 'column', justifyContent: 'center', padding: '0 60px', width: opts.cover ? 700 : W, height: H, gap: 18 },
			h('div', { alignItems: 'center', gap: 14 }, img(MARK, { width: 40, height: 40 }), h('div', { fontSize: 26, fontWeight: 600, color: C.muted }, 'Waterline')),
			h('div', { fontSize: 64, fontWeight: 700, color: C.text, letterSpacing: -1.5, lineHeight: 1.05 }, view.name),
			h('div', { fontSize: 28, color: C.muted }, sub),
			readings.length
				? h(
						'div',
						{ gap: 14, marginTop: 10 },
						...readings.map((r) =>
							h(
								'div',
								{ flexDirection: 'column', gap: 4, padding: '16px 20px', borderRadius: 18, background: C.surface, border: `2px solid ${r.level === 'bad' ? C.bad : C.border}`, minWidth: 170 },
								h('div', { fontSize: 22, color: C.muted }, r.name),
								h('div', { alignItems: 'baseline', gap: 6 }, h('div', { fontSize: 44, fontWeight: 700, color: C.text }, r.value), r.unit ? h('div', { fontSize: 20, color: C.muted }, r.unit) : null),
								h('div', { alignItems: 'center', gap: 6, fontSize: 20, fontWeight: 600, color: levelColor(r.level) }, statusIcon(r.level), statusWord(r.level, r.status))
							)
						)
					)
				: view.summary
					? h(
							'div',
							{ alignItems: 'center', gap: 10, fontSize: 30, fontWeight: 600, color: view.summary.bad.length ? C.bad : C.ok },
							statusIcon(view.summary.bad.length ? 'bad' : 'ok', 28),
							view.summary.bad.length ? view.summary.bad[0] : 'All in range'
						)
					: null,
			h('div', { fontSize: 20, color: C.muted, marginTop: 8 }, url)
		);
		if (!opts.cover) return render(h('div', { width: W, height: H, background: C.bg }, body));
		return render(
			h('div', { width: W, height: H, background: C.bg }, body, img(await photoData(opts.cover, 500, H), { width: 500, height: H }))
		);
	});
}

/** S2: shared photo, full bleed, with a caption band. */
export async function photoCard(share: { id: string; title: string | null; tankName: string | null; date: string | null }, photo: Photo) {
	return cached(`s-${share.id}-${createHash('sha1').update([share.title, share.tankName, share.date].join('|')).digest('hex').slice(0, 10)}`, async () => {
		const caption = [share.tankName, share.date].filter(Boolean).join(' · ');
		return render(
			h(
				'div',
				{ width: W, height: H, position: 'relative', background: C.bg },
				img(await photoData(photo, W, H), { width: W, height: H, position: 'absolute', top: 0, left: 0 }),
				h(
					'div',
					{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '28px 48px', background: 'rgba(3,10,12,0.72)', justifyContent: 'space-between', alignItems: 'flex-end' },
					h(
						'div',
						{ flexDirection: 'column', gap: 6 },
						share.title ? h('div', { fontSize: 40, fontWeight: 700, color: C.text }, share.title) : null,
						caption ? h('div', { fontSize: 24, color: C.muted }, caption) : null
					),
					h('div', { alignItems: 'center', gap: 10 }, img(MARK, { width: 32, height: 32 }), h('div', { fontSize: 22, fontWeight: 600, color: C.text }, 'Waterline'))
				)
			)
		);
	});
}

/** Generated alt text for share images. */
export function tankCardAlt(view: PublicView) {
	const r = view.readings.slice(0, 3).map((x) => `${x.name} ${x.value}${x.unit ? ' ' + x.unit : ''} (${x.level === 'ok' ? 'in range' : x.status.replace(/^[✓▲✕–] /, '').toLowerCase()})`);
	return `${view.name}, a ${view.type.toLowerCase()} aquarium${view.volume ? ` of ${view.volume}` : ''}${r.length ? `. Latest readings: ${r.join(', ')}` : ''}.`;
}
