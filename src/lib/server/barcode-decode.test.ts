import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';
import { describe, expect, it } from 'vitest';
import { decodeBarcodeImage } from './barcode-decode';

// the barcodes are drawn with zxing's writer, as a phone photo would show them: a JPEG with the box around
const require = createRequire(import.meta.url);
prepareZXingModule({ overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/writer/zxing_writer.wasm')) } });
async function photoOf(text: string, format: 'EAN-13' | 'UPC-A' | 'EAN-8' | 'QRCode') {
	const { svg } = await writeBarcode(text, { format, withHRT: format !== 'QRCode', withQuietZones: true });
	const png = new Resvg(svg, { fitTo: { mode: 'width', value: 700 }, background: 'white' }).render().asPng();
	return sharp(png).extend({ top: 180, bottom: 180, left: 140, right: 140, background: '#e8e2d6' }).resize(2200).jpeg({ quality: 82 }).toBuffer();
}

// drawing the digits under the bars makes resvg load the system's fonts, over a second a photo on a Mac,
// and more when the whole suite runs at once: the decode itself is quick
describe('decodeBarcodeImage', { timeout: 30_000 }, () => {
	it('reads the retail barcodes on a box as one canonical GTIN', async () => {
		expect(await decodeBarcodeImage(await photoOf('0015561104470', 'EAN-13'))).toEqual({ code: '0015561104470', format: 'EAN13' });
		expect(await decodeBarcodeImage(await photoOf('015561104470', 'UPC-A'))).toMatchObject({ code: '0015561104470' });
		expect(await decodeBarcodeImage(await photoOf('96385074', 'EAN-8'))).toEqual({ code: '96385074', format: 'EAN8' });
	});
	it("reads a GS1 Digital Link QR code's GTIN, and nothing from a plain photo", async () => {
		expect(await decodeBarcodeImage(await photoOf('https://id.gs1.org/01/00015561104470', 'QRCode'))).toEqual({ code: '0015561104470', format: 'QRCode' });
		const plain = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#2f7d4a' } }).jpeg().toBuffer();
		expect(await decodeBarcodeImage(plain)).toBeNull();
	});
	it('throws for a file that is no image', async () => {
		await expect(decodeBarcodeImage(Buffer.from('not a photo'))).rejects.toThrow();
	});
});
