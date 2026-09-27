// The add / edit expense form, read and checked (shared by both pages).
import { redirect, type Cookies } from '@sveltejs/kit';
import { parseMoney } from '$lib/money';
import { isDate, todayInZone } from '$lib/time';
import type { User } from './db/schema';
import { attachReceipt, CATEGORY_LABEL, removeReceipt, type ExpenseCategory, type ExpenseInput } from './expenses';
import { setFlash } from './flash';
import { optStr, str } from './forms';
import { listTanks } from './tanks';

export type ExpenseValues = Record<'amount' | 'what' | 'category' | 'date' | 'note' | 'tankId' | 'productId', string>;

/** The form's fields, checked: the expense, or what to fix. */
export function readExpenseForm(form: FormData, user: User, fallbackTankId: string) {
	const values: ExpenseValues = {
		amount: str(form, 'amount'),
		what: str(form, 'what').slice(0, 80),
		category: str(form, 'category'),
		date: str(form, 'date'),
		note: str(form, 'note').slice(0, 2000),
		tankId: str(form, 'tankId') || fallbackTankId,
		productId: str(form, 'productId')
	};
	const errors: Record<string, string> = {};
	const amountCents = parseMoney(values.amount);
	if (amountCents == null) errors.amount = 'Enter an amount, like 12.50.';
	if (!values.what) errors.what = 'Say what it was for.';
	if (!isDate(values.date)) errors.date = 'Choose a date.';
	else if (values.date > todayInZone(user.timeZone)) errors.date = "That's in the future.";
	// the keeper's own tanks only
	const tankId = listTanks(user.id).some((t) => t.id === values.tankId) ? values.tankId : fallbackTankId;
	const category = (values.category in CATEGORY_LABEL ? values.category : 'other') as ExpenseCategory;
	if (Object.keys(errors).length) return { errors, values };
	const input: ExpenseInput & { tankId: string } = {
		tankId,
		date: values.date,
		amountCents: amountCents!,
		category,
		what: values.what,
		note: optStr(form, 'note', 2000),
		productId: values.productId || null
	};
	return { input, values };
}

/**
 * After saving: the receipt chosen (or removed), then back to the tank's
 * Spending. A receipt that can't be kept leaves the expense saved, and opens
 * it to try another file.
 */
export async function finishExpense(form: FormData, user: User, expenseId: string, tankId: string, cookies: Cookies, message: string) {
	const file = form.get('receipt');
	if (file instanceof File && file.size) {
		const failed = await attachReceipt(user.id, expenseId, file);
		if (failed) {
			setFlash(cookies, `Expense saved, but not its receipt: ${failed.error}`);
			redirect(303, `/tanks/${tankId}/spending/${expenseId}`);
		}
	} else if (form.get('removeReceipt') === 'on') {
		removeReceipt(user.id, expenseId);
	}
	setFlash(cookies, message);
	redirect(303, `/tanks/${tankId}/spending`);
}
