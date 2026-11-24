// Cylinder refills (#368): a CO₂ item's refills, each a History entry, how long
// a fill lasts worked out from them, and an alert (off until turned on) for
// when the cylinder is likely running low.
import { redirect } from '@sveltejs/kit';
import { equipmentName } from '$lib/equipment';
import { parseMoney } from '$lib/money';
import { fillText, lastsText, refillDue, refillStats } from '$lib/refills';
import { setFlash } from '$lib/server/flash';
import { optStr, refuse, str } from '$lib/server/forms';
import { logRefill, refillItem, refillsOf, setRefillAlert } from '$lib/server/refills';
import { getTank, roleOn } from '$lib/server/tanks';
import { dateInZone, daysBetween, fmtDateLong, isDate, todayInZone } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const e = refillItem(user.id, params.id, params.eid);
	const role = roleOn(user.id, getTank(user.id, e.tankId));
	const today = todayInZone(user.timeZone);
	const rows = refillsOf(e).map((r) => ({ id: r.id, day: dateInZone(r.occurredAt, user.timeZone), note: r.note }));
	const s = refillStats(rows.map((r) => r.day));
	const cylinder = typeof e.specs.cylinder === 'string' ? e.specs.cylinder.trim() : '';
	return {
		item: { id: e.id, tankId: e.tankId, name: equipmentName(e), cylinder, removed: !!e.removedAt, alert: e.refillAlert },
		canLog: role !== 'view' && !e.removedAt,
		// a cost goes to Spending, which is the owner's
		canSpend: role === 'owner',
		currency: user.currency,
		today,
		stats: s.last
			? {
					last: fmtDateLong(s.last),
					ago: daysBetween(s.last, today),
					fill: fillText(s),
					due: refillDue(s, today)
				}
			: null,
		// newest first, each with how long the fill before it lasted
		refills: rows
			.map((r, i) => ({ id: r.id, day: fmtDateLong(r.day), note: r.note, lasted: i > 0 && rows[i - 1].day !== r.day ? `the fill before lasted ${lastsText(daysBetween(rows[i - 1].day, r.day))}` : null }))
			.reverse()
	};
};

const back = (p: { id: string; eid: string }) => `/tanks/${p.id}/equipment/${p.eid}/refills`;

export const actions: Actions = {
	refill: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const e = refillItem(user.id, params.id, params.eid);
		const form = await request.formData();
		const today = todayInZone(user.timeZone);
		const day = str(form, 'day') || today;
		const cost = str(form, 'cost');
		const values = { day, cost, note: str(form, 'note') };
		const errors: Record<string, string> = {};
		if (!isDate(day) || day > today) errors.day = 'Pick a day up to today.';
		const costCents = cost ? parseMoney(cost) : null;
		if (cost && costCents == null) errors.cost = 'Enter an amount, like 12.50, or leave it blank.';
		if (Object.keys(errors).length) return refuse('refill', errors, values);
		const logged = logRefill(user, e, { day, note: optStr(form, 'note', 500), costCents });
		if ('error' in logged) return refuse('refill', { day: logged.error }, values);
		setFlash(cookies, `✓ Refill logged${costCents != null ? ' · its cost is in Spending' : ''}`);
		redirect(303, back(params));
	},
	alert: async ({ request, locals, params, cookies }) => {
		const e = refillItem(locals.user!.id, params.id, params.eid);
		const on = (await request.formData()).get('alert') === 'on';
		setRefillAlert(locals.user!.id, e, on);
		setFlash(cookies, on ? '✓ You’ll be alerted when the cylinder is likely running low' : 'Cylinder alert turned off');
		redirect(303, back(params));
	}
};
