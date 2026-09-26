import { fail, redirect } from '@sveltejs/kit';
import { fmtValue, paramDecimals, paramUnit, storedValue } from '$lib/params';
import { defaultParameters } from '$lib/params';
import { setFlash } from '$lib/server/flash';
import { num, str } from '$lib/server/forms';
import {
	addCustomParam,
	deleteCustomParam,
	getTank,
	listParams,
	resetParamDefaults,
	updateParams
} from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id);
	const defaults = new Map(defaultParameters(user).map((d) => [d.key, d]));
	return {
		tank: { id: tank.id, name: tank.name, type: tank.type },
		rows: listParams(tank.id, { all: true }).map((p) => {
			const d = defaults.get(p.key);
			return {
				id: p.id,
				name: p.name,
				unit: paramUnit(p, user),
				isCustom: p.isCustom,
				tracked: p.tracked,
				decimals: paramDecimals(p, user),
				min: p.min == null ? '' : fmtValue(p, p.min, user),
				max: p.max == null ? '' : fmtValue(p, p.max, user),
				defaultText:
					d && !p.isCustom
						? `Default ${fmtValue(p, d.min, user)}–${fmtValue(p, d.max, user)}${paramUnit(p, user) ? ' ' + paramUnit(p, user) : ''}`
						: 'Custom parameter'
			};
		})
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		getTank(user.id, params.id);
		const form = await request.formData();
		const existing = listParams(params.id, { all: true });
		const errors: Record<string, string> = {};
		const rows = existing.map((p) => {
			const min = num(form, `min_${p.id}`);
			const max = num(form, `max_${p.id}`);
			if (min != null && max != null && min > max) errors[p.id] = 'Min must be below max.';
			return {
				id: p.id,
				min: min == null ? null : storedValue(p, min, user),
				max: max == null ? null : storedValue(p, max, user),
				tracked: form.get(`tracked_${p.id}`) === 'on'
			};
		});
		if (Object.keys(errors).length) return fail(400, { errors });
		updateParams(user.id, params.id, rows);
		setFlash(cookies, '✓ Targets saved');
		redirect(303, `/tanks/${params.id}/targets`);
	},
	reset: async ({ locals, params, cookies }) => {
		resetParamDefaults(locals.user!, params.id);
		setFlash(cookies, 'Targets reset to defaults');
		redirect(303, `/tanks/${params.id}/targets`);
	},
	addCustom: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const name = str(form, 'name').slice(0, 40);
		const unitChoice = str(form, 'unit');
		const unit = (unitChoice === 'custom' ? str(form, 'customUnit') : unitChoice).slice(0, 12);
		const min = num(form, 'min');
		const max = num(form, 'max');
		const decimals = Math.min(3, Math.max(0, Math.round(num(form, 'decimals') ?? 2)));
		const values = Object.fromEntries([...form].map(([k, v]) => [k, String(v)]));
		if (!name) return fail(400, { custom: { error: 'Give the parameter a name.', values } });
		if (min != null && max != null && min > max)
			return fail(400, { custom: { error: 'Min must be below max.', values } });
		addCustomParam(locals.user!.id, params.id, { name, unit, min, max, decimals });
		setFlash(cookies, `✓ ${name} added`);
		redirect(303, `/tanks/${params.id}/targets`);
	},
	deleteCustom: async ({ request, locals, params, cookies }) => {
		const id = String((await request.formData()).get('paramId') ?? '');
		deleteCustomParam(locals.user!.id, params.id, id);
		setFlash(cookies, 'Custom parameter removed');
		redirect(303, `/tanks/${params.id}/targets`);
	}
};
