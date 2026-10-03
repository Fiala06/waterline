import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { exifHint, parseExifDateTime, parseExifHint, readExifDate, readFileExifDate, takenAtFrom } from './exif';

/** A small JPEG whose details carry the given EXIF tags (sharp writes IFD0 and the Exif IFD as IFD2). */
async function jpegWith(exif: Record<string, Record<string, string>>) {
	return sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).jpeg().withExif(exif).toBuffer();
}

/** A bare big-endian TIFF/EXIF block: IFD0 → Exif IFD with DateTimeOriginal (and an offset when given). */
function bigEndianExif(dateTime: string, offset?: string) {
	const strings: { tag: number; value: string }[] = [{ tag: 0x9003, value: dateTime + '\0' }];
	if (offset) strings.push({ tag: 0x9011, value: offset + '\0' });
	const ifd0At = 8;
	const exifAt = ifd0At + 2 + 12 + 4;
	let dataAt = exifAt + 2 + strings.length * 12 + 4;
	const size = dataAt + strings.reduce((n, s) => n + s.value.length, 0);
	const b = Buffer.alloc(size);
	b.write('MM', 0, 'ascii');
	b.writeUInt16BE(42, 2);
	b.writeUInt32BE(ifd0At, 4);
	b.writeUInt16BE(1, ifd0At);
	b.writeUInt16BE(0x8769, ifd0At + 2);
	b.writeUInt16BE(4, ifd0At + 4);
	b.writeUInt32BE(1, ifd0At + 6);
	b.writeUInt32BE(exifAt, ifd0At + 10);
	b.writeUInt16BE(strings.length, exifAt);
	strings.forEach((s, i) => {
		const e = exifAt + 2 + i * 12;
		b.writeUInt16BE(s.tag, e);
		b.writeUInt16BE(2, e + 2);
		b.writeUInt32BE(s.value.length, e + 4);
		b.writeUInt32BE(dataAt, e + 8);
		b.write(s.value, dataAt, 'ascii');
		dataAt += s.value.length;
	});
	return Buffer.concat([Buffer.from('Exif\0\0'), b]);
}

describe('readExifDate', () => {
	it('reads DateTimeOriginal with its offset from a JPEG', async () => {
		const jpg = await jpegWith({ IFD0: { DateTime: '2024:05:06 09:00:00' }, IFD2: { DateTimeOriginal: '2024:05:06 07:08:09', OffsetTimeOriginal: '+02:00' } });
		expect(readExifDate(jpg)).toEqual({ date: '2024-05-06', time: '07:08:09', offset: '+02:00' });
	});

	it('reads the same from the EXIF block sharp hands over, and falls back to the digitized date', async () => {
		const jpg = await jpegWith({ IFD2: { DateTimeDigitized: '2023:12:31 23:59:58' } });
		const { exif } = await sharp(jpg).metadata();
		expect(exif).toBeDefined();
		expect(readExifDate(exif!)).toEqual({ date: '2023-12-31', time: '23:59:58', offset: null });
	});

	it('reads a big-endian block, with and without an offset', () => {
		expect(readExifDate(bigEndianExif('2022:01:02 03:04:05'))).toEqual({ date: '2022-01-02', time: '03:04:05', offset: null });
		expect(readExifDate(bigEndianExif('2022:01:02 03:04:05', '-07:00'))).toEqual({ date: '2022-01-02', time: '03:04:05', offset: '-07:00' });
	});

	it('is null for a photo without details, a blank date and junk', async () => {
		expect(readExifDate(await jpegWith({ IFD0: { Make: 'Test' } }))).toBeNull();
		expect(readExifDate(await jpegWith({ IFD2: { DateTimeOriginal: '    :  :     :  :  ' } }))).toBeNull();
		expect(readExifDate(await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).png().toBuffer())).toBeNull();
		expect(readExifDate(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78]))).toBeNull();
		expect(readExifDate(new Uint8Array(0))).toBeNull();
		expect(readExifDate(Buffer.from('not a photo at all'))).toBeNull();
	});

	it('is stripped from what the server stores', async () => {
		const jpg = await jpegWith({ IFD2: { DateTimeOriginal: '2024:05:06 07:08:09' } });
		const out = await sharp(jpg).rotate().jpeg().toBuffer();
		expect((await sharp(out).metadata()).exif).toBeUndefined();
	});
});

describe('parseExifDateTime', () => {
	it('rejects impossible dates and times', () => {
		expect(parseExifDateTime('2024:02:30 10:00:00', null)).toBeNull();
		expect(parseExifDateTime('2024:02:10 25:00:00', null)).toBeNull();
		expect(parseExifDateTime('2024:02:10 10:00:61', null)).toBeNull();
		expect(parseExifDateTime('yesterday', null)).toBeNull();
	});
	it('drops an offset that is not one', () => {
		expect(parseExifDateTime('2024:02:10 10:00:00', 'UTC')).toEqual({ date: '2024-02-10', time: '10:00:00', offset: null });
		expect(parseExifDateTime('2024:02:10 10:00:00', '+25:00')?.offset).toBeNull();
		expect(parseExifDateTime('2024:02:10 10:00:00', '+05:30')?.offset).toBe('+05:30');
	});
});

describe('takenAtFrom', () => {
	const now = new Date('2026-10-03T12:00:00Z');
	it('uses the offset when the camera wrote one', () => {
		expect(takenAtFrom({ date: '2026-09-14', time: '15:20:30', offset: '+02:00' }, 'America/Los_Angeles', now)).toBe('2026-09-14T13:20:30.000Z');
	});
	it('otherwise reads a local time in the keeper’s time zone, keeping the seconds', () => {
		expect(takenAtFrom({ date: '2026-09-14', time: '15:20:30', offset: null }, 'America/Los_Angeles', now)).toBe('2026-09-14T22:20:30.000Z');
		expect(takenAtFrom({ date: '2026-01-14', time: '15:20:00', offset: null }, 'Europe/Paris', now)).toBe('2026-01-14T14:20:00.000Z');
	});
	it('ignores missing, future and ancient dates', () => {
		expect(takenAtFrom(null, 'UTC', now)).toBeNull();
		expect(takenAtFrom({ date: '2026-10-03', time: '12:05:00', offset: '+00:00' }, 'UTC', now)).toBeNull();
		expect(takenAtFrom({ date: '2026-10-03', time: '12:01:00', offset: '+00:00' }, 'UTC', now)).toBe('2026-10-03T12:01:00.000Z');
		expect(takenAtFrom({ date: '1999-12-31', time: '23:59:59', offset: null }, 'UTC', now)).toBeNull();
		expect(takenAtFrom({ date: '2000-01-01', time: '00:00:00', offset: null }, 'UTC', now)).toBe('2000-01-01T00:00:00.000Z');
	});
});

describe('exif hints between the browser and the server', () => {
	it('round-trip', () => {
		for (const d of [
			{ date: '2024-05-06', time: '07:08:09', offset: '+02:00' },
			{ date: '2024-05-06', time: '07:08:09', offset: null }
		]) {
			expect(parseExifHint(exifHint(d))).toEqual(d);
		}
		expect(parseExifHint('')).toBeNull();
		expect(parseExifHint('2024-05-06')).toBeNull();
		expect(parseExifHint('2024-05-06T07:08:09Z')).toBeNull();
	});
	it('reads a File', async () => {
		const jpg = await jpegWith({ IFD2: { DateTimeOriginal: '2024:05:06 07:08:09' } });
		expect(await readFileExifDate(new File([jpg], 'a.jpg', { type: 'image/jpeg' }))).toEqual({ date: '2024-05-06', time: '07:08:09', offset: null });
		expect(await readFileExifDate(new File([jpg], 'a.txt', { type: 'text/plain' }))).toBeNull();
	});
});
