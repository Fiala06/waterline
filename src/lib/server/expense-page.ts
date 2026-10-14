// What the add and edit expense pages need to show the form.
import { fmtMoney } from '$lib/money';
import { todayInZone } from '$lib/time';
import type { User } from './db/schema';
import { equipmentChoices } from './expenses';
import { listTanks } from './tanks';

/** "$" for USD, "€" for EUR: the amount field's prefix. */
export const currencySymbol = (currency: string) => fmtMoney(0, currency).replace(/[\d.,\s]/g, '') || currency;

export function expensePage(user: User) {
	const tanks = listTanks(user.id).map((t) => ({ id: t.id, name: t.name }));
	return {
		tanks,
		// the items an expense can be for (#148), per tank, so the picker follows the tank chosen
		equipmentByTank: equipmentChoices(tanks.map((t) => t.id)),
		currencySymbol: currencySymbol(user.currency),
		today: todayInZone(user.timeZone)
	};
}
