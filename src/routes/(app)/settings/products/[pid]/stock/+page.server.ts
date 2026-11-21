// A saved product's stock (#318): what's left, in mL, from the latest
// measurement, refills since and the doses logged since; the low mark and its
// alert (off until turned on); the log, with Delete.
import { redirect } from '@sveltejs/kit';
import { dateInZone, fmtDateLong } from '$lib/time';
import { formatNumber, parseNumber } from '$lib/units';
import { setFlash } from '$lib/server/flash';
import { optStr, refuse, str } from '$lib/server/forms';
import { getProduct } from '$lib/server/products';
import { deleteStockEntry, measureStock, refillStock, setLowStock, stockFor, stockLog, stopStock } from '$lib/server/stock';
import type { Actions, PageServerLoad } from './$types';

const ml = (n: number) => `${formatNumber(n, n < 10 ? 1 : 0)} mL`;

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const p = getProduct(user.id, params.pid);
	const s = stockFor(user.id, [p]).get(p.id) ?? null;
	const day = (iso: string) => fmtDateLong(dateInZone(iso, user.timeZone));
	return {
		product: { id: p.id, name: p.name, lowMl: p.lowMl == null ? '' : formatNumber(p.lowMl, 0), lowAlert: p.lowAlert },
		stock: s && {
			left: ml(s.left),
			// icon and word, never color alone
			status: s.low ? `▲ Low · below ${ml(p.lowMl!)}` : p.lowMl != null ? `✓ Above ${ml(p.lowMl)}` : null,
			how: s.estimated
				? `Estimated: you measured ${ml(s.measured.ml)} on ${day(s.measured.at)}${s.refilled ? `, added ${ml(s.refilled)}` : ''}, and ${s.doses.count} dose${s.doses.count === 1 ? '' : 's'} of ${ml(s.doses.ml)} logged since in mL were taken off.`
				: `Measured: ${ml(s.measured.ml)} on ${day(s.measured.at)}${s.refilled ? `, plus ${ml(s.refilled)} added since` : ''}. No doses in mL logged since.`
		},
		log: stockLog(user.id, p.id).map((r) => ({ id: r.id, day: day(r.at), text: `${r.kind === 'set' ? 'Measured' : 'Refilled +'}${r.kind === 'set' ? ' ' : ''}${ml(r.ml)}`, note: r.note }))
	};
};

const back = (id: string) => `/settings/products/${id}/stock`;
const amountOf = (form: FormData) => parseNumber(form.get('ml'));

export const actions: Actions = {
	measure: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const n = amountOf(form);
		if (n == null || n < 0) return refuse('measure', 'Enter how many mL are left.', { ml: str(form, 'ml') });
		measureStock(locals.user!.id, params.pid, n, optStr(form, 'note', 200));
		setFlash(cookies, '✓ Stock saved');
		redirect(303, back(params.pid));
	},
	refill: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const n = amountOf(form);
		if (n == null || n <= 0) return refuse('refill', 'Enter how many mL you added.', { ml: str(form, 'ml') });
		refillStock(locals.user!.id, params.pid, n, optStr(form, 'note', 200));
		setFlash(cookies, '✓ Refill added');
		redirect(303, back(params.pid));
	},
	low: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const raw = str(form, 'lowMl');
		const n = raw ? parseNumber(raw) : null;
		if (raw && (n == null || n < 0)) return refuse('low', 'Enter a number of mL, or leave it blank.', { lowMl: raw });
		setLowStock(locals.user!.id, params.pid, n, form.get('lowAlert') === 'on');
		setFlash(cookies, '✓ Low mark saved');
		redirect(303, back(params.pid));
	},
	deleteEntry: async ({ request, locals, params, cookies }) => {
		deleteStockEntry(locals.user!.id, params.pid, str(await request.formData(), 'id'));
		setFlash(cookies, 'Entry deleted');
		redirect(303, back(params.pid));
	},
	stop: async ({ locals, params, cookies }) => {
		stopStock(locals.user!.id, params.pid);
		setFlash(cookies, 'Stopped tracking stock');
		redirect(303, back(params.pid));
	}
};
