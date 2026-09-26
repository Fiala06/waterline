// Form parsing shared by several actions.
import { TANK_TYPES, type TankType } from './db/schema';
import { isValidTimeZone, zonedToUtc } from '$lib/time';
import { parseNumber, toStored, type UnitPrefs } from '$lib/units';

export const str = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

export function optStr(form: FormData, key: string, max = 2000): string | null {
	const s = str(form, key).slice(0, max);
	return s === '' ? null : s;
}

export function num(form: FormData, key: string): number | null {
	return parseNumber(form.get(key));
}

export interface FieldErrors {
	[field: string]: string;
}

export function parseTankForm(form: FormData, prefs: UnitPrefs) {
	const errors: FieldErrors = {};
	const name = str(form, 'name').slice(0, 80);
	if (!name) errors.name = 'Give the tank a name.';
	const type = str(form, 'type') as TankType;
	if (!TANK_TYPES.includes(type)) errors.type = 'Choose a type.';

	const volume = (key: string) => {
		const v = num(form, key);
		if (v == null) return null;
		if (v <= 0) errors[key] = 'Enter a volume above 0.';
		return toStored(v, 'volume', prefs);
	};
	const length = (key: string) => {
		const v = num(form, key);
		if (v == null) return null;
		if (v <= 0) errors[key] = 'Enter a size above 0.';
		return toStored(v, 'length', prefs);
	};
	const photoperiod = () => {
		const v = num(form, 'photoperiodH');
		if (v == null) return null;
		if (v < 0 || v > 24) errors.photoperiodH = 'Enter 0–24 hours.';
		return v;
	};
	const startDate = optStr(form, 'startDate');
	if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) errors.startDate = 'Use a valid date.';

	return {
		errors,
		values: {
			name,
			type,
			nominalVolumeL: volume('nominalVolume'),
			...(form.has('actualVolume') ? { actualVolumeL: volume('actualVolume') } : {}),
			...(form.has('length')
				? { lengthCm: length('length'), widthCm: length('width'), heightCm: length('height') }
				: {}),
			...(form.has('startDate') ? { startDate } : {}),
			...(form.has('notes') ? { notes: optStr(form, 'notes') } : {}),
			...(form.has('specBrand')
				? {
						specBrand: optStr(form, 'specBrand', 60),
						specModel: optStr(form, 'specModel', 60),
						glass: optStr(form, 'glass', 60),
						substrate: optStr(form, 'substrate', 60),
						waterSource: ['tap', 'rodi', 'mix', 'well'].includes(str(form, 'waterSource')) ? str(form, 'waterSource') : null,
						photoperiodH: photoperiod()
					}
				: {})
		}
	};
}

/**
 * When a log happened. Empty date/time = now. Future times are rejected
 * (a couple of minutes of clock skew is allowed).
 */
export function parseWhen(form: FormData, timeZone: string): { at: string } | { error: string } {
	const date = str(form, 'date');
	const time = str(form, 'time');
	if (!date && !time) return { at: new Date().toISOString() };
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: 'Pick a valid date and time.' };
	const at = zonedToUtc(date, time, timeZone);
	if (Number.isNaN(at.getTime())) return { error: 'Pick a valid date and time.' };
	if (at.getTime() > Date.now() + 2 * 60_000) return { error: "Logs can't be in the future." };
	return { at: at.toISOString() };
}

export function parseTimeZone(value: string, fallback: string) {
	return value && isValidTimeZone(value) ? value : fallback;
}
