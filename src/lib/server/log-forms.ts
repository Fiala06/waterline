// Parsing and view data for the water test and log event forms (new + edit).
import { error } from '@sveltejs/kit';
import {
	additivesOf,
	DOSING_UNITS,
	EQUIPMENT_ACTIONS,
	EQUIPMENT_REASONS,
	LIVESTOCK_ACTIONS,
	LIVESTOCK_STATUS,
	MAINTENANCE_ACTIONS,
	OBSERVATION_TAGS,
	WATER_SOURCES
} from '$lib/events';
import { MAX_LIVESTOCK_COUNT } from '$lib/livestock';
import { displayValue, fmtRange, fmtValue, foldsInTestForm, paramDecimals, paramUnit, storedValue } from '$lib/params';
import { dueInfo, effectiveDue, nextDueAfterCompletion } from '$lib/tasks';
import { paramTip, whenToTest } from '$lib/tips';
import { fmtDate, todayInZone, utcToZoned } from '$lib/time';
import { formatNumber, parseNumber, toDisplay, toStored, unitLabel } from '$lib/units';
import { EVENT_CATEGORIES, type EventCategory, type Tank, type TankParameter, type User } from './db/schema';
import { num, optStr, str, type FieldErrors } from './forms';
import { lastEventOf, latestTest } from './logs';
import { getTask, taskOfKind } from './tasks';

export function parseCategory(value: string | null): EventCategory {
	return EVENT_CATEGORIES.includes(value as EventCategory) ? (value as EventCategory) : 'water_change';
}

/** Parameters for the test form, in display units, with the previous reading. */
export function testFormParams(
	params: TankParameter[],
	latest: Map<string, { value: number; takenAt: string }>,
	user: User,
	tankType: string
) {
	return params.map((p) => {
		const last = latest.get(p.id);
		const lastValue = last ? fmtValue(p, last.value, user) : null;
		return {
			id: p.id,
			key: p.key,
			name: p.name,
			unit: paramUnit(p, user),
			decimals: paramDecimals(p, user),
			// exact target in display units, so the live status matches the saved one
			min: p.min == null ? null : displayValue(p, p.min, user),
			max: p.max == null ? null : displayValue(p, p.max, user),
			rangeText: fmtRange(p, user),
			last: last ? `Last ${lastValue} · ${fmtDate(utcToZoned(last.takenAt, user.timeZone).date)}` : null,
			// what "Use last readings" types in
			lastInput: lastValue,
			tip: p.isCustom ? null : paramTip(p.key, tankType),
			when: p.isCustom ? null : (whenToTest(p.key, tankType)?.text ?? null),
			// under "Show N more" on a new test (#65)
			later: foldsInTestForm(p, tankType, !!last)
		};
	});
}

/**
 * The water test's "Also log a water change" (05, 08): on when the last test
 * was logged with one, set to the last change's amount and source.
 */
export function testWaterChange(tank: Tank, user: User) {
	const last = lastEventOf(tank.id, 'water_change');
	const test = latestTest(tank.id);
	const values = last ? eventFormValues('water_change', last.data, user) : {};
	return {
		on: !!last && !!test && last.occurredAt === test.takenAt,
		amountMode: values.amountMode === 'volume' ? 'volume' : 'percent',
		amount: (values.amount as string | undefined) || '25',
		source: (values.source as string | undefined) || 'tap',
		task: completableTask(user, tank.id, 'water_change', null),
		...eventFormContext(tank, user)
	};
}

/** Readings from the test form (`v_<parameterId>`), converted to stored units. */
export function parseReadings(form: FormData, params: TankParameter[], user: User) {
	const readings = new Map<string, number>();
	const errors: FieldErrors = {};
	for (const p of params) {
		const raw = str(form, `v_${p.id}`);
		if (raw === '') continue;
		const v = num(form, `v_${p.id}`);
		if (v == null) {
			errors[p.id] = 'Enter a number.';
			continue;
		}
		readings.set(p.id, storedValue(p, v, user));
	}
	return { readings, errors };
}

/**
 * The task this log can also complete: the one passed in (?task=) or the
 * soonest open task of the matching kind that is overdue or due soon.
 */
export function completableTask(
	user: User,
	tankId: string,
	kind: 'water_change' | 'test' | 'maintenance' | null,
	requestedId: string | null
) {
	const today = todayInZone(user.timeZone);
	let task = null;
	let fromRequest = false;
	if (requestedId) {
		const t = getTask(user.id, requestedId);
		if (t.tankId !== tankId) error(400, 'Task belongs to another tank');
		task = t;
		fromRequest = true;
	} else if (kind) {
		const t = taskOfKind(user.id, tankId, kind);
		if (t && dueInfo(t.due, today).section !== 'later') task = t;
	}
	const due = task ? effectiveDue(task) : null;
	if (!task || !due) return null;
	const next = nextDueAfterCompletion(task, today, today);
	const d = dueInfo(due, today);
	// "Also mark the reminder “Water change 25%” done", then where it stands: ticked by itself when it's due
	const state = d.days < 0 ? `${-d.days} day${d.days === -1 ? '' : 's'} overdue` : d.days === 0 ? 'Due today' : `Not due until ${fmtDate(due)}`;
	const after = next ? (d.days > 0 ? `next would be ${fmtDate(next)}` : `next ${fmtDate(next)}`) : 'closes the reminder';
	return {
		id: task.id,
		name: task.name,
		label: `Also mark the reminder “${task.name}” done`,
		sub: `${state} · ${after}`,
		checked: fromRequest || d.days <= 0
	};
}

/** Volume used for water change % ↔ volume: actual if known, else nominal. */
export function tankVolumeL(tank: Tank) {
	return tank.actualVolumeL ?? tank.nominalVolumeL ?? null;
}

export function eventFormContext(tank: Tank, user: User) {
	const vol = tankVolumeL(tank);
	// % or volume, and how much: the way the last water change was logged
	const last = lastEventOf(tank.id, 'water_change');
	const values = last ? eventFormValues('water_change', last.data, user) : null;
	return {
		volUnit: unitLabel('volume', user),
		tankVolume: vol == null ? null : Number(formatNumber(toDisplay(vol, 'volume', user), 1)),
		tankVolumeIsActual: tank.actualVolumeL != null,
		lastAmountMode: (values?.amountMode === 'volume' ? 'volume' : 'percent') as 'volume' | 'percent',
		lastAmount: (values?.amount as string | undefined) || null
	};
}

/** Category-specific `data` from the log event form. */
export function parseEventData(
	category: EventCategory,
	form: FormData,
	tank: Tank,
	user: User
): { data: Record<string, unknown>; errors: FieldErrors } {
	const errors: FieldErrors = {};
	const pick = <T extends string>(key: string, allowed: readonly T[]) => {
		const v = str(form, key) as T;
		return allowed.includes(v) ? v : null;
	};
	const many = (key: string, allowed: string[]) =>
		form
			.getAll(key)
			.map(String)
			.filter((v) => allowed.includes(v));

	switch (category) {
		case 'water_change': {
			const mode = str(form, 'amountMode') === 'volume' ? 'volume' : 'percent';
			const additives = parseAdditives(form, errors);
			const amount = num(form, 'amount');
			const source = pick(
				'source',
				WATER_SOURCES.map((s) => s.value)
			);
			const vol = tankVolumeL(tank);
			if (amount == null || amount <= 0) {
				errors.amount = 'Enter how much water you changed.';
				return { data: {}, errors };
			}
			if (mode === 'percent') {
				if (amount > 100) errors.amount = 'Enter a percentage up to 100.';
				return {
					data: {
						amount_mode: 'percent',
						percent: amount,
						...(vol ? { volume_l: (vol * amount) / 100 } : {}),
						...(source ? { source } : {}),
						...(additives.length ? { additives } : {})
					},
					errors
				};
			}
			const volumeL = toStored(amount, 'volume', user);
			return {
				data: {
					amount_mode: 'volume',
					volume_l: volumeL,
					...(vol ? { percent: Math.round((volumeL / vol) * 1000) / 10 } : {}),
					...(source ? { source } : {}),
					...(additives.length ? { additives } : {})
				},
				errors
			};
		}
		case 'dosing': {
			const product = str(form, 'product').slice(0, 80);
			const amount = num(form, 'amount');
			const unit = pick('unit', DOSING_UNITS) ?? 'mL';
			if (!product) errors.product = 'Enter the product you dosed.';
			if (amount != null && amount < 0) errors.amount = 'Enter an amount of 0 or more.';
			return { data: { product, ...(amount != null ? { amount } : {}), unit }, errors };
		}
		case 'feeding': {
			const food = str(form, 'food').slice(0, 80);
			const amount = num(form, 'amount');
			// pinches, cubes, mL, g… or whatever was typed
			const unit = str(form, 'unit').slice(0, 20) || null;
			if (!food) errors.food = 'Enter the food.';
			if (amount != null && amount < 0) errors.amount = 'Enter an amount of 0 or more.';
			return { data: { food, ...(amount != null ? { amount } : {}), ...(unit ? { unit } : {}) }, errors };
		}
		case 'maintenance': {
			const actions = many('actions', MAINTENANCE_ACTIONS);
			if (!actions.length && !optStr(form, 'note')) errors.actions = 'Pick what you did or add a note.';
			return { data: { actions }, errors };
		}
		case 'livestock': {
			const action = pick(
				'action',
				LIVESTOCK_ACTIONS.map((a) => a.value)
			);
			const name = str(form, 'name').slice(0, 80);
			const count = num(form, 'count');
			const status = pick(
				'status',
				LIVESTOCK_STATUS.map((s) => s.value)
			);
			if (!action) errors.action = 'Choose added, removed or moved.';
			if (!name) errors.name = 'Enter the species or plant.';
			if (count != null && (count < 0 || count > MAX_LIVESTOCK_COUNT || !Number.isInteger(count))) errors.count = 'Enter a whole number from 0 to 10,000.';
			return { data: { action, name, ...(count != null ? { count } : {}), ...(status ? { status } : {}) }, errors };
		}
		case 'equipment': {
			const action = pick(
				'action',
				EQUIPMENT_ACTIONS.map((a) => a.value)
			);
			const item = str(form, 'item').slice(0, 80);
			const reasons = many('reasons', EQUIPMENT_REASONS);
			if (!action) errors.action = 'Choose what changed.';
			if (!item) errors.item = 'Enter the equipment.';
			return { data: { action, item, reasons }, errors };
		}
		case 'observation': {
			const tags = many('tags', OBSERVATION_TAGS);
			if (!tags.length && !optStr(form, 'note')) errors.tags = 'Pick what you noticed or add a note.';
			return { data: { tags }, errors };
		}
		case 'note': {
			if (!optStr(form, 'note')) errors.note = 'Write a note.';
			return { data: {}, errors };
		}
		case 'health': {
			// the health page has its own form; here a note is enough
			if (!optStr(form, 'note')) errors.note = 'Write what you noticed.';
			return { data: {}, errors };
		}
	}
}

/**
 * The conditioner / remineraliser rows on the water change form
 * (`additive_product`, `additive_amount`, `additive_unit`, one of each per row).
 * Rows with no product are skipped; an amount without a product is an error.
 */
function parseAdditives(form: FormData, errors: FieldErrors) {
	const products = form.getAll('additive_product').map((v) => String(v).trim().slice(0, 80));
	const amounts = form.getAll('additive_amount').map(String);
	const units = form.getAll('additive_unit').map((v) => String(v).trim().slice(0, 20));
	const out: { product: string; amount?: number; unit?: string }[] = [];
	products.forEach((product, i) => {
		const raw = (amounts[i] ?? '').trim();
		const unit = units[i] ?? '';
		if (!product) {
			if (raw) errors[`additive_${i}`] = 'Name the product.';
			return;
		}
		let amount: number | undefined;
		if (raw) {
			const n = parseNumber(raw);
			if (n == null || n < 0) {
				errors[`additive_${i}`] = 'Enter an amount of 0 or more.';
				return;
			}
			amount = n;
		}
		out.push({ product, ...(amount != null ? { amount } : {}), ...(unit ? { unit } : {}) });
	});
	return out;
}

/** Form values (display units) for editing an existing event. */
export function eventFormValues(
	category: EventCategory,
	data: Record<string, unknown>,
	user: User
): Record<string, string | string[]> {
	const s = (v: unknown) => (v == null ? '' : String(v));
	switch (category) {
		case 'water_change': {
			const additives = additivesOf(data);
			const added = {
				additive_product: additives.map((a) => a.product),
				additive_amount: additives.map((a) => s(a.amount)),
				additive_unit: additives.map((a) => s(a.unit))
			};
			return typeof data.percent === 'number' && data.amount_mode !== 'volume'
				? { amountMode: 'percent', amount: formatNumber(data.percent, 1), source: s(data.source), ...added }
				: {
						amountMode: 'volume',
						amount: typeof data.volume_l === 'number' ? formatNumber(toDisplay(data.volume_l, 'volume', user), 1) : '',
						source: s(data.source),
						...added
					};
		}
		case 'dosing':
			return { product: s(data.product), amount: s(data.amount), unit: s(data.unit) || 'mL' };
		case 'feeding':
			return { food: s(data.food), amount: s(data.amount), unit: s(data.unit) };
		case 'maintenance':
			return { actions: (data.actions as string[]) ?? [] };
		case 'livestock':
			return { action: s(data.action), name: s(data.name), count: s(data.count), status: s(data.status) };
		case 'equipment':
			return { action: s(data.action), item: s(data.item), reasons: (data.reasons as string[]) ?? [] };
		case 'observation':
			return { tags: (data.tags as string[]) ?? [] };
		default:
			return {};
	}
}
