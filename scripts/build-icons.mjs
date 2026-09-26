// Generates app icons and favicons from the Waterline mark (2c; 2a below 24px).
//   node scripts/build-icons.mjs
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const BG = '#0c1a1f';
const ACCENT = '#4fc4bd';
const RING = '#e6f0f0';

// 2c "inset water": ring r=24.5, water r=19 below y=31
const mark2c = (stroke = 3) =>
	`<defs><clipPath id="w"><circle cx="28" cy="28" r="19"/></clipPath></defs><rect x="0" y="31" width="56" height="30" fill="${ACCENT}" clip-path="url(#w)"/><circle cx="28" cy="28" r="24.5" fill="none" stroke="${RING}" stroke-width="${stroke}"/>`;
// 2a solid: ring r=24, water fills below y=32
const mark2a = (stroke) =>
	`<defs><clipPath id="w"><circle cx="28" cy="28" r="24"/></clipPath></defs><rect x="0" y="32" width="56" height="30" fill="${ACCENT}" clip-path="url(#w)"/><circle cx="28" cy="28" r="24" fill="none" stroke="${RING}" stroke-width="${stroke}"/>`;

/** size px canvas, mark scaled to `fraction` of it, optional corner radius */
function icon(size, fraction, mark, radius = 0) {
	const m = size * fraction;
	const off = (size - m) / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>
<svg x="${off}" y="${off}" width="${m}" height="${m}" viewBox="0 0 56 56">${mark}</svg></svg>`;
}

const out = [
	// iOS applies its own rounded mask; 112/180 like the design
	['apple-touch-icon.png', icon(180, 112 / 180, mark2c(3))],
	// "any" icons
	['icon-192.png', icon(192, 0.62, mark2c(3))],
	['icon-512.png', icon(512, 0.62, mark2c(3))],
	// maskable: mark inside the 66% safe zone (design: 104/192)
	['icon-512-maskable.png', icon(512, 104 / 192, mark2c(3))],
	['favicon-32.png', icon(32, 24 / 32, mark2a(5), 7)]
];
for (const [name, svg] of out) {
	await sharp(Buffer.from(svg)).png().toFile(`static/icons/${name}`);
	console.log('wrote static/icons/' + name);
}
writeFileSync(
	'static/favicon.svg',
	icon(56, 1, mark2a(4), 12).replace(/width="56" height="56" viewBox="0 0 56 56">\n<rect/, 'viewBox="0 0 56 56">\n<rect')
);
console.log('wrote static/favicon.svg');
