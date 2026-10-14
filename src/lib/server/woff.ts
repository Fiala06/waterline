// A WOFF 1.0 font unwrapped to the TTF/OTF (sfnt) it carries: the table
// directory rebuilt and each compressed table inflated. The share images'
// fonts ship as WOFF (@fontsource), and satori's text shaper since 0.4x reads
// only raw sfnt data: given WOFF it maps every character to the font's
// "missing glyph" box (#153), while its outline reader still copes.
import { inflateSync } from 'node:zlib';

const WOFF = 0x774f4646; // 'wOFF'
const HEADER = 44;
const ENTRY = 20;
const pad4 = (n: number) => (n + 3) & ~3;

/** Whether the bytes are a WOFF 1.0 file. */
export const isWoff = (data: Uint8Array) => data.length >= HEADER && new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0) === WOFF;

/** The sfnt inside a WOFF 1.0 file; anything else is returned as it is. */
export function woffToSfnt(data: Buffer): Buffer {
	if (!isWoff(data)) return data;
	const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const flavor = dv.getUint32(4);
	const numTables = dv.getUint16(12);
	const tables: { tag: Uint8Array; data: Buffer; checksum: number }[] = [];
	for (let i = 0; i < numTables; i++) {
		const o = HEADER + i * ENTRY;
		const offset = dv.getUint32(o + 4);
		const compLength = dv.getUint32(o + 8);
		const origLength = dv.getUint32(o + 12);
		const raw = data.subarray(offset, offset + compLength);
		const table = compLength < origLength ? inflateSync(raw) : Buffer.from(raw);
		if (table.length !== origLength) throw new Error(`WOFF table ${String.fromCharCode(...data.subarray(o, o + 4))}: ${table.length} bytes, expected ${origLength}`);
		tables.push({ tag: data.subarray(o, o + 4), data: table, checksum: dv.getUint32(o + 16) });
	}
	// the sfnt header's binary-search helpers, as the spec defines them
	const entrySelector = Math.floor(Math.log2(numTables));
	const searchRange = 2 ** entrySelector * 16;
	const directory = 12 + numTables * 16;
	const out = Buffer.alloc(tables.reduce((n, t) => n + pad4(t.data.length), directory));
	out.writeUInt32BE(flavor, 0);
	out.writeUInt16BE(numTables, 4);
	out.writeUInt16BE(searchRange, 6);
	out.writeUInt16BE(entrySelector, 8);
	out.writeUInt16BE(numTables * 16 - searchRange, 10);
	let pos = directory;
	tables.forEach((t, i) => {
		const r = 12 + i * 16;
		out.set(t.tag, r);
		out.writeUInt32BE(t.checksum, r + 4);
		out.writeUInt32BE(pos, r + 8);
		out.writeUInt32BE(t.data.length, r + 12);
		out.set(t.data, pos);
		pos += pad4(t.data.length);
	});
	return out;
}
