import { error, fail } from '@sveltejs/kit';
import { equipmentName } from '$lib/equipment';
import { addExpense } from '$lib/server/expenses';
import { finishExpense, readExpenseForm } from '$lib/server/expense-form';
import { expensePage } from '$lib/server/expense-page';
import { getProduct } from '$lib/server/products';
import { getEquipment } from '$lib/server/specs';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id, 'owner');
	// "Log a purchase" of a saved product
	const productId = url.searchParams.get('product');
	const product = productId ? getProduct(user.id, productId) : null;
	// "Add expense" from an item's page (#148): its name, Equipment, and the link, filled in
	const equipmentId = url.searchParams.get('equipment');
	const item = equipmentId ? getEquipment(user.id, equipmentId) : null;
	if (item && item.tankId !== tank.id) error(404, 'Equipment not found');
	return {
		...expensePage(user),
		tank: { id: tank.id, name: tank.name },
		values: {
			amount: '',
			what: product?.name ?? (item ? equipmentName(item) : ''),
			category: product ? 'consumables' : item ? 'equipment' : '',
			date: '',
			note: '',
			tankId: tank.id,
			productId: product?.id ?? '',
			equipmentId: item?.id ?? ''
		}
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		getTank(user.id, params.id, 'owner');
		const form = await request.formData();
		const read = readExpenseForm(form, user, params.id);
		if (!read.input) return fail(400, { errors: read.errors, values: read.values });
		const { tankId, ...input } = read.input;
		const e = addExpense(user.id, tankId, input);
		return finishExpense(form, user, e.id, tankId, cookies, '✓ Expense added');
	}
};
