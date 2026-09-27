import { describe, expect, it } from 'vitest';
import { currencyName, fmtMoney, moneyInput, parseMoney } from './money';

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
