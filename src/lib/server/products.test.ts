import { describe, expect, it, vi } from 'vitest';

// products.ts opens the database; these tests only need its URL checks
vi.mock('./db', () => ({ db: {} }));
const { productHost, productUrl } = await import('./products');

describe('productUrl', () => {
	it('keeps web addresses and adds https:// to a bare one', () => {
		expect(productUrl('https://www.amazon.com/dp/B0002APWF6')).toBe('https://www.amazon.com/dp/B0002APWF6');
		expect(productUrl('  amazon.com/dp/B0002APWF6 ')).toBe('https://amazon.com/dp/B0002APWF6');
		expect(productUrl('http://shop.example.org/prime?size=500ml')).toBe('http://shop.example.org/prime?size=500ml');
	});

	it('refuses anything that could run script or isn’t a web page', () => {
		expect(productUrl('javascript:alert(1)')).toBeNull();
		expect(productUrl('JavaScript:alert(1)')).toBeNull();
		expect(productUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
		expect(productUrl('ftp://example.com/file')).toBeNull();
		expect(productUrl('mailto:shop@example.com')).toBeNull();
	});

	it('refuses what isn’t an address', () => {
		expect(productUrl('')).toBeNull();
		expect(productUrl('Seachem Prime')).toBeNull();
		expect(productUrl('prime')).toBeNull();
		expect(productUrl(`https://example.com/${'a'.repeat(2000)}`)).toBeNull();
	});
});

describe('productHost', () => {
	it('shows the site without www.', () => {
		expect(productHost('https://www.amazon.com/dp/B0002APWF6')).toBe('amazon.com');
		expect(productHost('https://shop.example.org/prime')).toBe('shop.example.org');
	});
});
