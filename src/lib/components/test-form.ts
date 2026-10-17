// The water test form's logic (#120): each reading's row, the line before
// Save, the button's words. Pure, so TestForm.svelte only wires it up, and
// test-form.test.ts covers it.
import { WATER_SOURCES } from '$lib/events';
import { paramStatus, statusIcon, statusMedium, type Status } from '$lib/status';
import { dropsAsPpm, parseNumber } from '$lib/units';
import { joinNames } from './entry-form';

export interface TestParam {
	id: string;
	/** gh, kh… (the hardness hints need it) */
	key?: string;
	name: string;
	unit: string;
	min: number | null;
	max: number | null;
	rangeText: string;
	last: string | null;
	lastInput?: string | null;
	/** what the parameter is (ⓘ), for standard ones */
	tip?: string | null;
	/** when a test is worth doing (#91) */
	when?: string | null;
	/** folded under "Show N more" on a new test (#65) */
	later?: boolean;
}

export type ReadingRow = TestParam & {
	raw: string;
	v: number | null;
	st: Status | null;
	/** "was 40": the saved value while it's being changed, else the value before the last edit */
	was: string | null;
	lastValue: string;
	lastDate: string;
	/** GH or KH in degrees: drop kits count them, 1 drop = 1° */
	degrees: boolean;
	/** GH or KH in ppm: a value that reads like drops, with its ppm */
	drops: ReturnType<typeof dropsAsPpm>;
};

/** A parameter's row as typed: its value, status, and what to show beside it. */
export function readingRow(
	p: TestParam,
	raw: string,
	opts: { mode: 'new' | 'edit'; saved?: string; previous?: string | null }
): ReadingRow {
	const v = parseNumber(raw);
	const st = v == null ? null : paramStatus(v, { min: p.min, max: p.max });
	const saved = opts.saved ?? '';
	const was = opts.mode !== 'edit' ? null : saved !== raw && saved ? saved : (opts.previous ?? null);
	// "Last 7.0 · Sep 18": the date only fits on phones (05 vs 08)
	const [lastValue, lastDate = ''] = (p.last ?? '').split(' · ');
	const hard = p.key === 'gh' || p.key === 'kh';
	const degrees = hard && /^d[GK]H$/.test(p.unit);
	// in ppm, a small 7 or a round 80 reads like drops (a degree is ~17.9 ppm): offer the ppm
	const drops = hard && !degrees ? dropsAsPpm(v) : null;
	return { ...p, raw, v, st, was, lastValue, lastDate, degrees, drops };
}

/** "▲ Nitrate is above target. Saving adds it to Needs attention.", before Save on a new test. */
export function attentionSummary(rows: Pick<ReadingRow, 'name' | 'st'>[]): string {
	const bad = rows.filter((r) => r.st?.level === 'bad');
	const warn = rows.filter((r) => r.st?.level === 'warn');
	if (bad.length) {
		const one = bad.length === 1;
		const how = one ? (bad[0].st?.direction === 'high' ? 'above' : 'below') + ' target' : 'out of range';
		return `▲ ${joinNames(bad)} ${one ? 'is' : 'are'} ${how}. Saving adds ${one ? 'it' : 'them'} to Needs attention.`;
	}
	if (warn.length) return `▲ ${joinNames(warn)} ${warn.length === 1 ? 'is' : 'are'} near a limit.`;
	return '';
}

/** "Save 3 readings + water change", "Save changes" */
export function testSaveLabel(mode: 'new' | 'edit', filled: number, withWaterChange: boolean): string {
	if (mode === 'edit') return 'Save changes';
	if (!filled) return 'Save';
	return `Save ${filled} reading${filled === 1 ? '' : 's'}${withWaterChange ? ' + water change' : ''}`;
}

/** "In range", "Near limit", "Above 5–20": after the icon in 08, 7.5 and G6. */
export function statusWord(r: Pick<ReadingRow, 'st' | 'unit' | 'rangeText'>): string {
	if (!r.st) return '';
	if (r.st.level !== 'bad') return statusMedium(r.st).slice(2);
	const unit = r.unit ? ` ${r.unit}` : '';
	const range = (unit && r.rangeText.endsWith(unit) ? r.rangeText.slice(0, -unit.length) : r.rangeText).replace(/^[≤≥] /, '');
	return `${r.st.direction === 'high' ? 'Above' : 'Below'} ${range}`;
}

/** The icon and its word: "✕ Above 5–20". */
export const shortStatus = (r: Pick<ReadingRow, 'st' | 'unit' | 'rangeText'>) => (r.st ? `${statusIcon[r.st.level]} ${statusWord(r)}` : '');

/** What a reading field keeps of what was typed: digits, one kind of point, a minus. */
export const cleanReading = (typed: string) => typed.replace(',', '.').replace(/[^0-9.\-]/g, '');

/** "25% · Tap", "10 gal · RO/DI": the water change logged alongside, folded. */
export function waterChangeSummary(amount: string, mode: string, volUnit: string, source: string): string {
	return `${amount || '–'}${mode === 'percent' ? '%' : ` ${volUnit}`} · ${WATER_SOURCES.find((s) => s.value === source)?.label ?? ''}`;
}
