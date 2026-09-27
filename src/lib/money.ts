// Spending (#7): amounts as people type them, kept in hundredths (cents) so
// totals add up exactly, and shown in the keeper's currency.

/** The currencies Settings offers, most common first. */
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'JPY', 'INR', 'BRL', 'MXN', 'ZAR', 'SGD', 'HKD'] as const;

export const isCurrency = (c: string) => (CURRENCIES as readonly string[]).includes(c);

/** "US dollar ($)" */
export function currencyName(code: string): string {
	try {
		const name = new Intl.DisplayNames('en-US', { type: 'currency' }).of(code) ?? code;
		const symbol = new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
			.formatToParts(0)
			.find((p) => p.type === 'currency')?.value;
		return symbol && symbol !== code ? `${name} (${symbol})` : `${name} (${code})`;
	} catch {
		return code;
	}
}

/** "$12.50", "€1,234.00", "¥1,500" */
export function fmtMoney(cents: number, currency = 'USD'): string {
	try {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(cents / 100);
	} catch {
		return `${(cents / 100).toFixed(2)} ${currency}`;
	}
}

/** For a form field: 1250 → "12.50", 1200 → "12" */
export const moneyInput = (cents: number) => (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));

/**
 * An amount as typed: "12.50", "$12.50", "12,50", "1,234.56", "1.234,56",
 * "€ 7". Hundredths (cents); null when it isn't one, or below 0.
 */
export function parseMoney(input: unknown): number | null {
	if (typeof input !== 'string' && typeof input !== 'number') return null;
	let s = String(input)
		.trim()
		.replace(/[\s ]/g, '')
		.replace(/^[^\d.,-]+|[^\d.,]+$/g, '');
	if (!s || !/^-?[\d.,]+$/.test(s)) return null;
	const lastDot = s.lastIndexOf('.');
	const lastComma = s.lastIndexOf(',');
	if (lastDot >= 0 && lastComma >= 0) {
		// the last one is the decimal point: 1,234.56 or 1.234,56
		const dec = lastDot > lastComma ? '.' : ',';
		s = s.replace(new RegExp(`\\${dec === '.' ? ',' : '.'}`, 'g'), '').replace(dec, '.');
	} else if (lastComma >= 0) {
		// 12,50 is a decimal comma; 1,234 is thousands
		s = /,\d{1,2}$/.test(s) && s.split(',').length === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
	} else if (s.split('.').length > 2) {
		s = s.replace(/\.(?=.*\.)/g, '');
	}
	const n = Number(s);
	if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return null;
	return Math.round(n * 100);
}
