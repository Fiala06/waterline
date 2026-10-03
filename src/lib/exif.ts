// The date a photo was taken, read from its details (EXIF) before the server
// strips them (#42). Shared by the browser, which reads it to offer the date
// before uploading, and the server, whose reading is the one that counts.
// Nothing else from the details (GPS, camera) is read or kept.
import { fmtDate, isDate, isTime, utcToZoned, zonedToUtc, type When } from './time';

/** The wall-clock time written by the camera, and its UTC offset when the camera knew it. */
export interface ExifDate {
	date: string; // YYYY-MM-DD
	time: string; // HH:MM:SS
	offset: string | null; // "+02:00", or null for a local time in the keeper's time zone
}

const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_ORIGINAL = 0x9003;
const TAG_DATE_DIGITIZED = 0x9004;
const TAG_OFFSET_ORIGINAL = 0x9011;
const TAG_OFFSET_DIGITIZED = 0x9012;

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));
const startsWith = (b: Uint8Array, s: string, at = 0) => b.length >= at + s.length && ascii(b, at, s.length) === s;

/** Where the TIFF header starts inside a JPEG, PNG, WebP or a bare EXIF block; -1 when there's none. */
function tiffStart(b: Uint8Array): number {
	if (startsWith(b, 'Exif\0\0')) return 6;
	if (startsWith(b, 'II*\0') || startsWith(b, 'MM\0*')) return 0;
	// JPEG: segments from the start; EXIF is the APP1 segment that begins with "Exif"
	if (b[0] === 0xff && b[1] === 0xd8) {
		let p = 2;
		while (p + 4 <= b.length && b[p] === 0xff) {
			const marker = b[p + 1];
			if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
				p += 2;
				continue;
			}
			if (marker === 0xda || marker === 0xd9) break; // image data: no more headers
			const len = (b[p + 2] << 8) | b[p + 3];
			if (marker === 0xe1 && startsWith(b, 'Exif\0\0', p + 4)) return p + 10;
			p += 2 + len;
		}
		return -1;
	}
	// PNG: chunks of length, type, data, crc; EXIF is the eXIf chunk
	if (startsWith(b, '\x89PNG\r\n\x1a\n')) {
		let p = 8;
		while (p + 8 <= b.length) {
			const len = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
			const type = ascii(b, p + 4, 4);
			if (type === 'eXIf') return startsWith(b, 'Exif\0\0', p + 8) ? p + 14 : p + 8;
			if (type === 'IEND') break;
			p += 12 + len;
		}
		return -1;
	}
	// WebP: RIFF chunks of fourcc, size, data (padded to an even length)
	if (startsWith(b, 'RIFF') && startsWith(b, 'WEBP', 8)) {
		let p = 12;
		while (p + 8 <= b.length) {
			const type = ascii(b, p, 4);
			const len = (b[p + 4] | (b[p + 5] << 8) | (b[p + 6] << 16) | (b[p + 7] << 24)) >>> 0;
			if (type === 'EXIF') return startsWith(b, 'Exif\0\0', p + 8) ? p + 14 : p + 8;
			p += 8 + len + (len % 2);
		}
		return -1;
	}
	return -1;
}

/**
 * The date taken in a photo's EXIF: DateTimeOriginal, else DateTimeDigitized
 * (CreateDate), with OffsetTimeOriginal / OffsetTimeDigitized when the camera
 * wrote one. null when the file has no details or no usable date in them.
 * `bytes` is the file, or the EXIF block on its own (as sharp's metadata gives it).
 */
export function readExifDate(bytes: Uint8Array | ArrayBuffer): ExifDate | null {
	const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	try {
		const t = tiffStart(b);
		if (t < 0 || t + 8 > b.length) return null;
		const le = ascii(b, t, 2) === 'II';
		if (!le && ascii(b, t, 2) !== 'MM') return null;
		const view = new DataView(b.buffer, b.byteOffset + t, b.byteLength - t);
		const u16 = (at: number) => view.getUint16(at, le);
		const u32 = (at: number) => view.getUint32(at, le);
		if (u16(2) !== 42) return null;
		// each IFD: a count, then 12-byte entries of tag, type, count, value or offset
		const entries = (ifd: number) => {
			const out = new Map<number, { type: number; count: number; at: number }>();
			if (ifd + 2 > view.byteLength) return out;
			const n = u16(ifd);
			for (let i = 0; i < n && ifd + 2 + i * 12 + 12 <= view.byteLength; i++) {
				const e = ifd + 2 + i * 12;
				const type = u16(e + 2);
				const count = u32(e + 4);
				const size = (type === 3 ? 2 : type === 4 || type === 9 ? 4 : type === 5 || type === 10 ? 8 : 1) * count;
				out.set(u16(e), { type, count, at: size <= 4 ? e + 8 : u32(e + 8) });
			}
			return out;
		};
		const text = (m: ReturnType<typeof entries>, tag: number) => {
			const e = m.get(tag);
			if (!e || e.type !== 2 || e.at + e.count > view.byteLength) return null;
			return ascii(b, t + e.at, e.count).replace(/\0.*$/s, '').trim();
		};
		const ifd0 = entries(u32(4));
		const pointer = ifd0.get(TAG_EXIF_IFD);
		if (!pointer) return null;
		const exif = entries(u32(pointer.at));
		const pick = (dateTag: number, offsetTag: number) => parseExifDateTime(text(exif, dateTag), text(exif, offsetTag));
		return pick(TAG_DATE_ORIGINAL, TAG_OFFSET_ORIGINAL) ?? pick(TAG_DATE_DIGITIZED, TAG_OFFSET_DIGITIZED);
	} catch {
		return null;
	}
}

/** "2024:05:06 07:08:09" and "+02:00" as EXIF writes them; null for a blank or junk one. */
export function parseExifDateTime(dt: string | null, offset: string | null): ExifDate | null {
	const m = dt?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
	if (!m) return null;
	const date = `${m[1]}-${m[2]}-${m[3]}`;
	const time = `${m[4]}:${m[5]}:${m[6]}`;
	if (!isDate(date) || !isTime(time.slice(0, 5)) || Number(m[6]) > 59) return null;
	const off = offset?.match(/^([+-])(\d{2}):(\d{2})/);
	return { date, time, offset: off && Number(off[2]) <= 14 && Number(off[3]) <= 59 ? `${off[1]}${off[2]}:${off[3]}` : null };
}

/** The earliest year a photo can be from: anything before is a camera that was never set. */
export const EARLIEST_YEAR = 2000;

/**
 * The instant a photo was taken, from its EXIF date: with the camera's offset
 * when it wrote one, else as a local time in the keeper's time zone. null for a
 * missing date, one before 2000 or one in the future (a camera clock that's wrong).
 */
export function takenAtFrom(d: ExifDate | null | undefined, timeZone: string, now = new Date()): string | null {
	if (!d) return null;
	if (Number(d.date.slice(0, 4)) < EARLIEST_YEAR) return null;
	const at = d.offset ? new Date(`${d.date}T${d.time}${d.offset}`) : withSeconds(zonedToUtc(d.date, d.time.slice(0, 5), timeZone), d.time);
	if (Number.isNaN(at.getTime())) return null;
	if (at.getTime() > now.getTime() + 2 * 60_000) return null;
	return at.toISOString();
}

const withSeconds = (d: Date, time: string) => new Date(d.getTime() + Number(time.slice(6, 8) || 0) * 1000);

/** The date as the browser sends it with the upload: "2024-05-06T07:08:09+02:00", or without the offset for a local time. */
export const exifHint = (d: ExifDate) => `${d.date}T${d.time}${d.offset ?? ''}`;

/** The browser's hint back into an EXIF date; null for anything else. */
export function parseExifHint(s: string | null | undefined): ExifDate | null {
	const m = s?.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})([+-]\d{2}:\d{2})?$/);
	if (!m) return null;
	return parseExifDateTime(`${m[1].replaceAll('-', ':')} ${m[2]}`, m[3] ?? null);
}

/** Read the date taken from a File in the browser: only the start of the file, where the details are. */
export async function readFileExifDate(file: File): Promise<ExifDate | null> {
	if (!file.type.startsWith('image/')) return null;
	try {
		return readExifDate(await file.slice(0, 512 * 1024).arrayBuffer());
	} catch {
		return null;
	}
}

/**
 * The photo's date as a wall-clock moment in the keeper's time zone, for the
 * log form's "Use the photo's date": the camera's local time as it is, or its
 * instant moved into the zone when it wrote an offset.
 */
export function exifToWhen(d: ExifDate, timeZone: string): When {
	if (d.offset) return utcToZoned(new Date(`${d.date}T${d.time}${d.offset}`), timeZone);
	return { date: d.date, time: d.time.slice(0, 5) };
}

/** "Sep 14, 3:20 PM" for the offer. */
export function fmtWhenShort(w: When): string {
	const [h, m] = w.time.split(':').map(Number);
	const t = new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
	return `${fmtDate(w.date)}, ${t}`;
}
