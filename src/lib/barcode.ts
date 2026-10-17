// Product barcodes (#147). What a scanner or the keeper gives (the digits
// under the bars, a UPC-E, a GS1 Digital Link QR code, a GS1 element string)
// becomes one canonical GTIN, so the same box always matches: EAN-13 (a
// 12-digit UPC-A gets a 0 in front), EAN-8 as it is, or a 14-digit GTIN-14 as
// it is. The check digit is checked, so a typo doesn't become a product nobody
// has.

/** What the reader looks for: retail barcodes, and the 2D codes a box carries its GTIN in. zxing's names. */
export const READ_FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'ITF', 'Code128', 'QRCode', 'DataMatrix'] as const;
/** The same, as the browser's own BarcodeDetector names them. */
export const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128', 'qr_code', 'data_matrix'] as const;

/** GS1's check digit for the digits before it: mod 10, with weights 3 and 1 from the right. */
export function gs1CheckDigit(body: string): number {
	let sum = 0;
	for (let i = 0; i < body.length; i++) {
		const d = body.charCodeAt(body.length - 1 - i) - 48;
		sum += i % 2 === 0 ? d * 3 : d;
	}
	return (10 - (sum % 10)) % 10;
}

/** Whether these are the 8, 12, 13 or 14 digits of a GTIN, check digit included. */
export function isGtin(digits: string): boolean {
	if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return false;
	return gs1CheckDigit(digits.slice(0, -1)) === Number(digits.at(-1));
}

/**
 * A UPC-E (8 digits: the number system, six digits and the check digit) as
 * the UPC-A it stands for; null when it isn't one.
 */
export function upcEToUpcA(upce: string): string | null {
	if (!/^[01]\d{7}$/.test(upce)) return null;
	const d = upce.slice(1, 7);
	const last = d[5];
	let body: string;
	if (last === '0' || last === '1' || last === '2') body = `${d.slice(0, 2)}${last}0000${d.slice(2, 5)}`;
	else if (last === '3') body = `${d.slice(0, 3)}00000${d.slice(3, 5)}`;
	else if (last === '4') body = `${d.slice(0, 4)}00000${d[4]}`;
	else body = `${d.slice(0, 5)}0000${last}`;
	const upca = `${upce[0]}${body}${upce[7]}`;
	return isGtin(upca) ? upca : null;
}

/** The reader said UPC-E: BarcodeDetector's "upc_e", zxing's "UPCE" or "UPC-E". */
const isUpcE = (format: string | undefined) => !!format && /^upc[-_]?e$/i.test(format);

/**
 * The canonical GTIN in what was read or typed, or null when there's no
 * product barcode in it. A GS1 Digital Link ("https://id.gs1.org/01/09506000134352")
 * and a GS1 element string ("(01)09506000134352(10)…" or "0109506000134352…")
 * give their GTIN; a bare number is read as typed, spaces and dashes allowed.
 * `format` is the reader's, so a UPC-E is expanded rather than mistaken for an
 * EAN-8. A QR code that's just a web address is nothing.
 */
export function normalizeBarcode(raw: string | null | undefined, format?: string): string | null {
	const s = (raw ?? '').trim();
	if (!s) return null;
	let digits: string;
	if (/^https?:\/\//i.test(s)) {
		const m = /\/01\/(\d{8,14})(?=[/?#]|$)/.exec(s);
		if (!m) return null;
		digits = m[1];
	} else if (/^\(01\)\d{14}/.test(s)) {
		digits = s.slice(4, 18);
	} else if (/^01\d{14}/.test(s) && isGtin(s.slice(2, 16))) {
		digits = s.slice(2, 16);
	} else {
		digits = s.replace(/[\s-]/g, '');
		if (!/^\d+$/.test(digits)) return null;
	}
	return canonicalGtin(digits, format);
}

/** EAN-13 for 12 and 13 digits (and a GTIN-14 with a 0 in front), EAN-8 and other GTIN-14s as they are. */
export function canonicalGtin(digits: string, format?: string): string | null {
	if (digits.length === 8 && isUpcE(format)) {
		const upca = upcEToUpcA(digits);
		return upca ? `0${upca}` : null;
	}
	if (!isGtin(digits)) return null;
	if (digits.length === 12) return `0${digits}`;
	if (digits.length === 14 && digits.startsWith('0')) return digits.slice(1);
	return digits;
}
