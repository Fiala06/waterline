// A barcode read from a photo on the server (#147), for the scanner page
// without scripts or a camera: the photo is decoded by zxing-wasm, the same
// reader the browser uses, loaded once from node_modules (never fetched).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { normalizeBarcode, READ_FORMATS } from '$lib/barcode';

/** longest side a photo is read at: enough for the bars of a phone photo, quick to scan */
const SIDE = 1600;
let prepared = false;

function prepare() {
	if (prepared) return;
	const require = createRequire(import.meta.url);
	prepareZXingModule({ overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) } });
	prepared = true;
}

/**
 * The first product barcode in a photo (a JPEG, PNG or WebP), as its canonical
 * GTIN, or null when there's none. Throws when the file isn't an image.
 */
export async function decodeBarcodeImage(input: Buffer): Promise<{ code: string; format: string } | null> {
	prepare();
	const { data, info } = await sharp(input, { failOn: 'error', limitInputPixels: 100_000_000 })
		.rotate()
		.resize(SIDE, SIDE, { fit: 'inside', withoutEnlargement: true })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const image = { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height, colorSpace: 'srgb' as const };
	const found = await readBarcodes(image, { formats: [...READ_FORMATS], tryHarder: true, maxNumberOfSymbols: 4 });
	for (const r of found) {
		const code = normalizeBarcode(r.text, r.format);
		if (code) return { code, format: r.format };
	}
	return null;
}
