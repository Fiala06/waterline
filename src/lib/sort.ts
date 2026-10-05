// Sorting a tab's list (#79): the choice lives in the address (?sort=name&dir=asc),
// so it works without scripts and every visit starts in the list's own order.

export type SortDir = 'asc' | 'desc';
export interface SortChoice<K extends string = string> {
	key: K;
	dir: SortDir;
}

/** The sort in the address, when it names one of `keys`; null keeps the list's own order. */
export function readSort<K extends string>(url: URL, keys: readonly K[]): SortChoice<K> | null {
	// "added" with dir=desc from a header, or "added:desc" from the Sort by menu without scripts
	const [raw, inline] = (url.searchParams.get('sort') ?? '').split(':');
	const key = raw as K;
	if (!key || !keys.includes(key)) return null;
	return { key, dir: (inline ?? url.searchParams.get('dir')) === 'desc' ? 'desc' : 'asc' };
}

/**
 * The address for a column header: its key in `first` order, or the other way
 * round when it's already the sort. Other parts of the address stay.
 */
export function sortHref(url: URL, key: string, current: SortChoice | null, first: SortDir = 'asc'): string {
	const q = new URLSearchParams(url.searchParams);
	const dir: SortDir = current?.key === key ? (current.dir === 'asc' ? 'desc' : 'asc') : first;
	q.set('sort', key);
	q.set('dir', dir);
	return `?${q}`;
}

/** "ascending" / "descending" for a header's aria-sort, or none when it isn't the sort. */
export const ariaSort = (key: string, current: SortChoice | null) =>
	current?.key === key ? (current.dir === 'asc' ? 'ascending' : 'descending') : 'none';

/**
 * A copy of `rows` in the chosen order, by the value `by` gives each one.
 * Words compare without case and with numbers in order ("Tank 2" before "Tank 10");
 * rows without a value go last either way; ties keep their order.
 */
export function sortRows<T>(rows: readonly T[], choice: SortChoice | null, by: (row: T, key: string) => string | number | null | undefined): T[] {
	if (!choice) return [...rows];
	const sign = choice.dir === 'asc' ? 1 : -1;
	const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
	return rows
		.map((row, i) => ({ row, i, v: by(row, choice.key) }))
		.sort((a, b) => {
			const an = a.v == null || a.v === '';
			const bn = b.v == null || b.v === '';
			if (an || bn) return an === bn ? a.i - b.i : an ? 1 : -1;
			const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : collator.compare(String(a.v), String(b.v));
			return c ? c * sign : a.i - b.i;
		})
		.map((x) => x.row);
}
