// The wish list (#24): what's planned for a tank, Add to tank, and the purchase in Spending.
import { fail, redirect } from '@sveltejs/kit';
import { EQUIPMENT_TYPE_LABEL, EQUIPMENT_TYPES } from '$lib/equipment';
import { fmtMoney, moneyInput, parseMoney } from '$lib/money';
import { fmtDateLong, dateInZone } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { productHost } from '$lib/server/products';
import { addWish, addWishToTank, deleteWish, listWishes, parseWish, restoreWish, wishTotals } from '$lib/server/wishes';
import { getTank, roleOn } from '$lib/server/tanks';
import type { Wish } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const KIND_LABEL: Record<string, string> = { fish: 'Fish', invert: 'Invert', coral: 'Coral', plant: 'Plant', equipment: 'Equipment' };

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id);
	const view = (w: Wish) => ({
		id: w.id,
		kind: w.kind,
		kindLabel: w.kind === 'equipment' && w.equipmentType ? EQUIPMENT_TYPE_LABEL[w.equipmentType] : KIND_LABEL[w.kind],
		name: w.kind === 'plant' || w.kind === 'equipment' ? w.name : `${w.count} ${w.name}`,
		scientific: w.scientificName,
		note: w.note,
		price: w.priceCents != null ? fmtMoney(w.priceCents, user.currency) : null,
		priceInput: w.priceCents != null ? moneyInput(w.priceCents) : '',
		url: w.url,
		host: w.url ? productHost(w.url) : null,
		added: w.addedAt ? fmtDateLong(dateInZone(w.addedAt, user.timeZone)) : null
	});
	const planned = listWishes(user.id, tank.id);
	const totals = wishTotals(planned);
	return {
		tank: { id: tank.id, name: tank.name, type: tank.type },
		role: roleOn(user.id, tank),
		water: (tank.type === 'reef' ? 'marine' : tank.type === 'brackish' ? null : 'fresh') as 'marine' | 'fresh' | null,
		items: planned.map(view),
		added: listWishes(user.id, tank.id, { added: true }).map(view),
		// "3 planned · about $62"
		totals: { count: totals.count, money: totals.priced ? `${totals.priced < totals.count ? 'at least ' : 'about '}${fmtMoney(totals.cents, user.currency)}` : null },
		currency: user.currency,
		equipmentTypes: EQUIPMENT_TYPES.map((t) => ({ value: t, label: EQUIPMENT_TYPE_LABEL[t] }))
	};
};

export const actions: Actions = {
	add: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const { errors, input, values } = parseWish(form);
		if (Object.keys(errors).length) return fail(400, { errors, values });
		const w = addWish(locals.user!.id, params.id, input);
		setFlash(cookies, `✓ ${w.name} on the wish list`);
		redirect(303, `/tanks/${params.id}/wishlist`);
	},
	delete: async ({ request, locals, params, cookies }) => {
		const w = deleteWish(locals.user!.id, params.id, str(await request.formData(), 'id'));
		setFlash(cookies, `${w.name} taken off the wish list`, { undo: { action: `/tanks/${params.id}/wishlist?/restore`, name: 'id', value: w.id } });
		redirect(303, `/tanks/${params.id}/wishlist`);
	},
	/** Undo of a delete: the row comes back as it was. */
	restore: async ({ request, locals, params, cookies }) => {
		const w = restoreWish(locals.user!.id, params.id, str(await request.formData(), 'id'));
		if (!w) return fail(410);
		setFlash(cookies, `✓ ${w.name} is back on the list`);
		redirect(303, `/tanks/${params.id}/wishlist`);
	},
	/** Add to tank, with the purchase in Spending when ticked. */
	addToTank: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const spend = form.get('spend') === 'on';
		const amount = str(form, 'amount');
		const amountCents = amount ? parseMoney(amount) : null;
		if (spend && amount && amountCents == null) return fail(400, { addError: { id: str(form, 'id'), error: 'Enter the price paid, like 12.50.' } });
		const { message } = addWishToTank(user, params.id, str(form, 'id'), { spend, amountCents });
		setFlash(cookies, message);
		redirect(303, `/tanks/${params.id}/wishlist`);
	}
};
