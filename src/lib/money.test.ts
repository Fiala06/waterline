import { describe, expect, it } from 'vitest';
import { currencyName, fmtMoney, fmtSums, mainCurrency, moneyInput, parseMoney, sumByCurrency } from './money';

describe('parseMoney', () => {
	it('reads amounts as people type them', () => {
		expect(parseMoney('12.50')).toBe(1250);
		expect(parseMoney('$12.50')).toBe(1250);
		expect(parseMoney(' € 7 ')).toBe(700);
		expect(parseMoney('12,50')).toBe(1250);
		expect(parseMoney('1,234')).toBe(123400);
		expect(parseMoney('1,234.56')).toBe(123456);
		expect(parseMoney('1.234,56')).toBe(123456);
		expect(parseMoney('19.99 USD')).toBe(1999);
		expect(parseMoney('0.1')).toBe(10);
		expect(parseMoney(3.456)).toBe(346);
	});

	it('refuses what isn’t an amount', () => {
		expect(parseMoney('')).toBeNull();
		expect(parseMoney('free')).toBeNull();
		expect(parseMoney('-5')).toBeNull();
		expect(parseMoney('1e9')).toBeNull();
		expect(parseMoney(null)).toBeNull();
	});
});

describe('showing money', () => {
	it('in the keeper’s currency', () => {
		expect(fmtMoney(1250)).toBe('$12.50');
		expect(fmtMoney(123400, 'EUR')).toBe('€1,234.00');
		expect(fmtMoney(150000, 'JPY')).toBe('¥1,500');
		expect(currencyName('USD')).toBe('US Dollar ($)');
	});

	it('for a form field', () => {
		expect(moneyInput(1250)).toBe('12.50');
		expect(moneyInput(1200)).toBe('12');
	});
});

describe('amounts in more than one currency (#307)', () => {
	it('sums per currency, never across', () => {
		const sums = sumByCurrency([
			{ cents: 1299, currency: 'USD' },
			{ cents: 500, currency: 'EUR' },
			{ cents: 101, currency: 'USD' }
		]);
		expect(sums).toEqual({ USD: 1400, EUR: 500 });
	});

	it('shows the keeper’s own currency first', () => {
		expect(fmtSums({ USD: 1400, EUR: 500 }, 'USD')).toBe('$14.00 + €5.00');
		expect(fmtSums({ USD: 1400, EUR: 500 }, 'EUR')).toBe('€5.00 + $14.00');
		expect(fmtSums({ USD: 1400 }, 'EUR')).toBe('$14.00');
		expect(fmtSums({}, 'EUR')).toBe('€0.00');
		// no decimal places
		expect(fmtSums({ JPY: 150000, USD: 1299 }, 'JPY')).toBe('¥1,500 + $12.99');
	});

	it('measures bars in the keeper’s currency, else the most used', () => {
		expect(mainCurrency(['EUR', 'USD'], 'USD')).toBe('USD');
		expect(mainCurrency(['EUR', 'EUR', 'GBP'], 'USD')).toBe('EUR');
		expect(mainCurrency([], 'JPY')).toBe('JPY');
	});
});
