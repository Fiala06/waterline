import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { EQUIPMENT_TYPES, SPEC_FIELDS, SUGGESTED_TASK, equipmentName, specToDisplay, specToStored, type EquipmentType, type SpecField } from '$lib/equipment';
import { addDays, isDate, todayInZone } from '$lib/time';
import { formatNumber } from '$lib/units';
import type { Equipment, User } from './db/schema';
import { setFlash } from './flash';
import { num, optStr, str } from './forms';
import { addEquipment, getEquipment, removeEquipment, updateEquipment, type EquipmentInput } from './specs';
import { createTask } from './tasks';

/** Form values (display units) for an equipment item. */
export function equipmentFormValues(e: Equipment | null, user: User) {
	const type = (e?.type ?? 'filter') as EquipmentType;
	const specs: Record<string, string> = {};
	for (const t of EQUIPMENT_TYPES) {
		for (const f of SPEC_FIELDS[t]) {
			const v = e?.type === t ? e.specs[f.key] : undefined;
			specs[`${t}.${f.key}`] = v == null ? '' : typeof v === 'number' ? shown(f, v, user) : String(v);
		}
	}
	return {
		type,
		brand: e?.brand ?? '',
		model: e?.model ?? '',
		installedAt: e?.installedAt ?? todayInZone(user.timeZone),
		notes: e?.notes ?? '',
		specs
	};
}

const shown = (f: SpecField, stored: number, user: User) => formatNumber(specToDisplay(f, stored, user), 1);

function parse(form: FormData, user: User, before: Equipment | null) {
	const errors: Record<string, string> = {};
	const type = str(form, 'type') as EquipmentType;
	if (!EQUIPMENT_TYPES.includes(type)) errors.type = 'Choose a type.';
	const specs: Record<string, unknown> = {};
	for (const f of SPEC_FIELDS[type] ?? []) {
		const key = `spec.${f.key}`;
		if (f.kind === 'number') {
			// a number left as shown keeps its exact stored value (no 1200 → 1199.98)
			const old = before?.type === type ? before.specs[f.key] : undefined;
			if (typeof old === 'number' && str(form, key) === shown(f, old, user)) {
				specs[f.key] = old;
				continue;
			}
			const v = num(form, key);
			if (v == null) continue;
			if (v < 0) errors[key] = 'Enter 0 or more.';
			specs[f.key] = specToStored(f, v, user);
		} else {
			const v = optStr(form, key, 80);
			if (v) specs[f.key] = f.kind === 'select' && !f.options?.includes(v) ? null : v;
		}
	}
	const installedAt = optStr(form, 'installedAt');
	if (installedAt && !isDate(installedAt)) errors.installedAt = 'Pick a date.';
	const input: EquipmentInput = {
		type,
		brand: optStr(form, 'brand', 60),
		model: optStr(form, 'model', 60),
		specs,
		installedAt,
		notes: optStr(form, 'notes')
	};
	if (!input.brand && !input.model) errors.brand = 'Enter a brand or model.';
	return { errors, input };
}

export async function saveEquipmentAction(event: RequestEvent, tankId: string, equipmentId: string | null) {
	const user = event.locals.user!;
	const form = await event.request.formData();
	const before = equipmentId ? getEquipment(user.id, equipmentId) : null;
	const { errors, input } = parse(form, user, before);
	if (Object.keys(errors).length) return fail(400, { errors });
	if (equipmentId) {
		updateEquipment(user.id, equipmentId, input);
		setFlash(event.cookies, '✓ Equipment saved');
	} else {
		const e = addEquipment(user.id, tankId, input, user.timeZone);
		const suggestion = SUGGESTED_TASK[input.type];
		if (suggestion && form.get('createTask') === 'on') {
			createTask(user.id, tankId, {
				name: `${suggestion.verb} ${equipmentName(e)}`,
				kind: 'maintenance',
				recurring: true,
				intervalDays: suggestion.days,
				scheduleMode: 'completion',
				nextDue: addDays(todayInZone(user.timeZone), suggestion.days),
				openFormOnDone: false,
				equipmentId: e.id
			});
		}
		setFlash(event.cookies, `✓ ${equipmentName(e)} added`);
	}
	redirect(303, `/tanks/${tankId}/equipment`);
}

export function removeEquipmentAction(event: RequestEvent, equipmentId: string) {
	const e = removeEquipment(event.locals.user!.id, equipmentId);
	setFlash(event.cookies, `${equipmentName(e)} removed${e.tasksRemoved ? ' with its reminder' : ''}`);
	redirect(303, `/tanks/${e.tankId}/equipment`);
}
