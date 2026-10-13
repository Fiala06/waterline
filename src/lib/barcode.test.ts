import { describe, expect, it } from 'vitest';
import { canonicalGtin, gs1CheckDigit, isGtin, normalizeBarcode, upcEToUpcA } from './barcode';

describe('GTIN check digits', () => {
	it('computes and checks them', () => {
		expect(gs1CheckDigit('001556110447')).toBe(0); // a UPC-A as EAN-13
		expect(gs1CheckDigit('400638133393')).toBe(1); // GS1's own example
		expect(gs1CheckDigit('9638507')).toBe(4); // an EAN-8
		expect(isGtin('0015561104470')).toBe(true);
		expect(isGtin('015561104470')).toBe(true);
		expect(isGtin('96385074')).toBe(true);
		expect(isGtin('00015561104470')).toBe(true);
		expect(isGtin('0015561104471')).toBe(false);
		expect(isGtin('12345')).toBe(false);
		expect(isGtin('001556110447a')).toBe(false);
	});
});

describe('UPC-E', () => {
	it('expands to the UPC-A it stands for, by its last digit', () => {
		expect(upcEToUpcA('01234505')).toBe('012000003455'); // 0–2: two digits, the last, four zeros, three digits
		expect(upcEToUpcA('01234531')).toBe('012300000451'); // 3
		expect(upcEToUpcA('01234543')).toBe('012340000053'); // 4
		expect(upcEToUpcA('01234596')).toBe('012345000096'); // 5–9
		expect(upcEToUpcA('01234506')).toBeNull(); // the wrong check digit
		expect(upcEToUpcA('21234505')).toBeNull(); // not a UPC-E number system
	});
});

describe('normalizeBarcode', () => {
	it('makes one canonical GTIN of a UPC-A, an EAN-13, an EAN-8 and a GTIN-14', () => {
		expect(normalizeBarcode('015561104470')).toBe('0015561104470');
		expect(normalizeBarcode('0015561104470')).toBe('0015561104470');
		expect(normalizeBarcode('00015561104470')).toBe('0015561104470');
		expect(normalizeBarcode('10015561104477')).toBe('10015561104477'); // a case's GTIN-14 stays
		expect(normalizeBarcode('96385074')).toBe('96385074');
		expect(normalizeBarcode(' 0 015561 10447 0 ')).toBe('0015561104470');
		expect(normalizeBarcode('0-015561-104470')).toBe('0015561104470');
	});
	it('refuses a typo, words, a short number and a plain web address', () => {
		expect(normalizeBarcode('015561104471')).toBeNull();
		expect(normalizeBarcode('fluval 407')).toBeNull();
		expect(normalizeBarcode('407')).toBeNull();
		expect(normalizeBarcode('')).toBeNull();
		expect(normalizeBarcode(null)).toBeNull();
		expect(normalizeBarcode('https://example.com/promo?code=0015561104470')).toBeNull();
	});
	it("expands a UPC-E when the reader says that's what it is, and reads 8 digits as an EAN-8 otherwise", () => {
		expect(normalizeBarcode('01234505', 'upc_e')).toBe('0012000003455');
		expect(normalizeBarcode('01234505', 'UPCE')).toBe('0012000003455');
		expect(normalizeBarcode('01234505', 'UPC-E')).toBe('0012000003455');
		expect(normalizeBarcode('01234505')).toBeNull(); // not an EAN-8's check digit
		expect(normalizeBarcode('96385074', 'ean_8')).toBe('96385074');
		expect(canonicalGtin('96385074', 'EAN8')).toBe('96385074');
	});
	it('takes the GTIN out of a GS1 Digital Link and a GS1 element string', () => {
		expect(normalizeBarcode('https://id.gs1.org/01/00015561104470')).toBe('0015561104470');
		expect(normalizeBarcode('https://brand.example/01/09506000134352/10/ABC123?17=251231')).toBe('9506000134352');
		expect(normalizeBarcode('(01)00015561104470(10)LOT42')).toBe('0015561104470');
		expect(normalizeBarcode('010001556110447010LOT42')).toBe('0015561104470');
		expect(normalizeBarcode('0100015561104470')).toBe('0015561104470');
	});
});
