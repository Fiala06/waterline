import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { describe, expect, it } from 'vitest';
import { isWoff, woffToSfnt } from './woff';

const require = createRequire(import.meta.url);
const woff = readFileSync(require.resolve('@fontsource/inter/files/inter-latin-400-normal.woff'));

describe('woffToSfnt', () => {
	it('unwraps a WOFF into a TrueType sfnt with every table in place', () => {
		expect(isWoff(woff)).toBe(true);
		const sfnt = woffToSfnt(woff);
		expect(isWoff(sfnt)).toBe(false);
		// a TrueType flavour, with the table count of the WOFF
		expect(sfnt.readUInt32BE(0)).toBe(0x00010000);
		const numTables = woff.readUInt16BE(12);
		expect(sfnt.readUInt16BE(4)).toBe(numTables);
		const tags = Array.from({ length: numTables }, (_, i) => sfnt.subarray(12 + i * 16, 16 + i * 16).toString('latin1'));
		expect(tags).toContain('cmap');
		expect(tags).toContain('glyf');
		// each table sits where its record says and is 4-byte aligned
		for (let i = 0; i < numTables; i++) {
			const offset = sfnt.readUInt32BE(12 + i * 16 + 8);
			const length = sfnt.readUInt32BE(12 + i * 16 + 12);
			expect(offset % 4).toBe(0);
			expect(offset + length).toBeLessThanOrEqual(sfnt.length);
		}
		expect(sfnt.length).toBeGreaterThan(woff.length);
	});

	it('leaves anything that is not WOFF alone', () => {
		const ttf = woffToSfnt(woff);
		expect(woffToSfnt(ttf)).toBe(ttf);
	});

	// #153: satori's shaper given WOFF drew every character as the "missing glyph" box
	it('gives satori a font it can shape, so different letters get different outlines', async () => {
		const outline = async (data: Buffer, ch: string) => {
			const svg = await satori({ type: 'div', props: { style: { display: 'flex', fontSize: 40 }, children: ch } } as never, {
				width: 100,
				height: 60,
				fonts: [{ name: 'Inter', data, weight: 400, style: 'normal' }]
			});
			return / d="([^"]*)"/.exec(svg)?.[1] ?? '';
		};
		const sfnt = woffToSfnt(woff);
		const a = await outline(sfnt, 'A');
		const b = await outline(sfnt, 'B');
		expect(a).not.toBe('');
		expect(a).not.toBe(b);
	});
});
