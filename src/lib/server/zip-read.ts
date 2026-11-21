// Reading a ZIP (#306): Waterline's own backups, as yazl writes them, with
// Node's zlib and nothing else. The central directory names each file, its
// size and where its data starts; data is stored or deflated. Anything
// else (encrypted, ZIP64, another method) is refused rather than guessed at.
import { inflateRawSync } from 'node:zlib';

export class ZipError extends Error {}

export interface ZipEntry {
	name: string;
	method: number;
	compressedSize: number;
	size: number;
	offset: number;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** The files in the archive, by name. */
export function zipEntries(buf: Buffer): Map<string, ZipEntry> {
	// the end of central directory record: within the last 64 KB (its comment), searched backwards
	let eocd = -1;
	for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
		if (buf.readUInt32LE(i) === EOCD) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new ZipError("That file isn't a ZIP.");
	const count = buf.readUInt16LE(eocd + 10);
	const dirSize = buf.readUInt32LE(eocd + 12);
	const dirOffset = buf.readUInt32LE(eocd + 16);
	if (count === 0xffff || dirOffset === 0xffffffff) throw new ZipError('That ZIP is too large to read here.');
	if (dirOffset + dirSize > buf.length) throw new ZipError('That ZIP is cut short.');
	const out = new Map<string, ZipEntry>();
	let p = dirOffset;
	for (let n = 0; n < count; n++) {
		if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL) throw new ZipError('That ZIP is damaged.');
		const flags = buf.readUInt16LE(p + 8);
		const method = buf.readUInt16LE(p + 10);
		const compressedSize = buf.readUInt32LE(p + 20);
		const size = buf.readUInt32LE(p + 24);
		const nameLen = buf.readUInt16LE(p + 28);
		const extraLen = buf.readUInt16LE(p + 30);
		const commentLen = buf.readUInt16LE(p + 32);
		const offset = buf.readUInt32LE(p + 42);
		const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
		if (flags & 1) throw new ZipError('That ZIP is encrypted.');
		if (method !== 0 && method !== 8) throw new ZipError("That ZIP uses a kind of compression Waterline can't read.");
		if (!name.endsWith('/')) out.set(name, { name, method, compressedSize, size, offset });
		p += 46 + nameLen + extraLen + commentLen;
	}
	return out;
}

/** One file's contents. `limit`: refuse anything larger once inflated. */
export function zipRead(buf: Buffer, e: ZipEntry, limit = 512 * 1024 * 1024): Buffer {
	if (e.offset + 30 > buf.length || buf.readUInt32LE(e.offset) !== LOCAL) throw new ZipError('That ZIP is damaged.');
	const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
	const data = buf.subarray(start, start + e.compressedSize);
	if (data.length !== e.compressedSize) throw new ZipError('That ZIP is cut short.');
	if (e.size > limit) throw new ZipError(`${e.name} is too large.`);
	const out = e.method === 0 ? Buffer.from(data) : inflateRawSync(data, { maxOutputLength: Math.max(e.size, 1) });
	if (out.length !== e.size) throw new ZipError('That ZIP is damaged.');
	return out;
}
