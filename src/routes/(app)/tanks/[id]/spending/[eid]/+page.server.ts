import { error, redirect } from '@sveltejs/kit';
import { moneyInput } from '$lib/money';
import { deleteExpense, getExpense, updateExpense } from '$lib/server/expenses';
import { finishExpense, readExpenseForm } from '$lib/server/expense-form';
import { refuse } from '$lib/server/forms';
import { expensePage } from '$lib/server/expense-page';
import { setFlash } from '$lib/server/flash';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const e = getExpense(user.id, params.eid);
	if (e.tankId !== params.id) error(404, 'Expense not found');
	return {
		...expensePage(user, e.currency),
		tankId: e.tankId,
		values: { amount: moneyInput(e.amountCents), what: e.what, category: e.category, date: e.date, note: e.note ?? '', tankId: e.tankId, productId: e.productId ?? '', equipmentId: e.equipmentId ?? '' },
		receipt: e.receiptType ? { href: `/receipts/${e.id}`, type: e.receiptType } : null
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const e = getExpense(user.id, params.eid);
		if (e.tankId !== params.id) error(404, 'Expense not found');
		const form = await request.formData();
		const read = readExpenseForm(form, user, e.tankId);
		if (!read.input) return refuse('expense', read.errors, read.values);
		await updateExpense(user.id, e.id, read.input);
		return finishExpense(form, user, e.id, read.input.tankId, cookies, '✓ Expense saved');
	},
	delete: async ({ locals, params, cookies }) => {
		if (getExpense(locals.user!.id, params.eid).tankId !== params.id) error(404, 'Expense not found');
		const e = await deleteExpense(locals.user!.id, params.eid);
		setFlash(cookies, 'Expense deleted');
		redirect(303, `/tanks/${e.tankId}/spending`);
	}
};
