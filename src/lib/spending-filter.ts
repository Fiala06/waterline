// Spending's filters (#314): a category, dates from and to (or a month bar's),
// and words in what an expense was for, its note or its item, all at once.
// The page's list and its CSV download read them from the same URL.
import { fold } from './search';
import { isDate } from './time';

export const EXPENSE_CATEGORY_KEYS = ['livestock', 'plants', 'equipment', 'consumables', 'other'] as const;

export interface SpendingFilter {
	cat: (typeof EXPENSE_CATEGORY_KEYS)[number] | null;
	/** YYYY-MM-DD, both inclusive */
	from: string | null;
	to: string | null;
	q: string;
}

/** The last day of a 'YYYY-MM' month. */
export function monthEnd(month: string): string {
	const [y, m] = month.split('-').map(Number);
	return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** The filter in a URL: ?cat=, ?from=, ?to=, ?q=, and ?month= (a month bar) for its first and last day. */
export function readSpendingFilter(params: URLSearchParams): SpendingFilter {
	const c = params.get('cat');
	const cat = (EXPENSE_CATEGORY_KEYS as readonly string[]).includes(c ?? '') ? (c as SpendingFilter['cat']) : null;
	const day = (k: string) => {
		const v = params.get(k);
		return v && isDate(v) ? v : null;
	};
	let from = day('from');
	let to = day('to');
	const month = params.get('month');
	if (!from && !to && month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
		from = `${month}-01`;
		to = monthEnd(month);
	}
	if (from && to && from > to) [from, to] = [to, from];
	const q = (params.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
	return { cat, from, to, q };
}

export const isFiltered = (f: SpendingFilter) => !!(f.cat || f.from || f.to || f.q);

/** Whether an expense is in the filter: `item` is the name of the equipment it was for, if any. */
export function inSpendingFilter(f: SpendingFilter, e: { category: string; date: string; what: string; note: string | null }, item: string | null = null): boolean {
	if (f.cat && e.category !== f.cat) return false;
	if (f.from && e.date < f.from) return false;
	if (f.to && e.date > f.to) return false;
	if (f.q) {
		const t = fold(f.q);
		if (![e.what, e.note, item].some((s) => s && fold(s).includes(t))) return false;
	}
	return true;
}

/** The filter as URL parameters, with this change: null takes one out. */
export function spendingQuery(f: SpendingFilter, patch: Partial<Record<'cat' | 'from' | 'to' | 'q', string | null>> = {}): string {
	const u = new URLSearchParams();
	const v = { cat: f.cat, from: f.from, to: f.to, q: f.q || null, ...patch };
	for (const k of ['cat', 'from', 'to', 'q'] as const) if (v[k]) u.set(k, v[k]!);
	const s = u.toString();
	return s ? `?${s}` : '';
}
