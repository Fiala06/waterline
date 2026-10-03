import { fail } from '@sveltejs/kit';
import { addExpense } from '$lib/server/expenses';
import { finishExpense, readExpenseForm } from '$lib/server/expense-form';
import { expensePage } from '$lib/server/expense-page';
import { getProduct } from '$lib/server/products';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id, 'owner');
	// "Log a purchase" of a saved product
	const productId = url.searchParams.get('product');
	const product = productId ? getProduct(user.id, productId) : null;
	return {
		...expensePage(user),
		tank: { id: tank.id, name: tank.name },
		values: { amount: '', what: product?.name ?? '', category: product ? 'consumables' : '', date: '', note: '', tankId: tank.id, productId: product?.id ?? '' }
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
