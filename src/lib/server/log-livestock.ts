// Log event › Livestock / plants (G3) when it's linked to the tank's lists:
// "Added" adds to Livestock or Plants, "Removed" takes from them. Each
// writes its own History entry; this returns that entry so photos attach.
import { dateInZone } from '$lib/time';
import type { Tank, User } from './db/schema';
import { num, optStr, str } from './forms';
import { addLivestock, addPlant, changeCount, getLivestock, getPlant, removePlant, type EntryMeta } from './specs';

type Result = { eventId: string; message: string } | { errors: Record<string, string> };

export function handleLinkedLivestock(user: User, tank: Tank, form: FormData, at: string): Result | null {
	if (form.get('linked') !== '1') return null;
	const meta: EntryMeta = { at, note: optStr(form, 'note'), clientId: optStr(form, 'clientId', 64) };
	const action = str(form, 'action');
	if (action === 'added') {
		const name = str(form, 'name').slice(0, 80);
		if (!name) return { errors: { name: 'Enter the species or plant.' } };
		const kind = str(form, 'kind');
		if (kind === 'plant') {
			const position = str(form, 'position');
			const p = addPlant(user.id, tank.id, {
				name,
				scientificName: optStr(form, 'scientificName', 120),
				position: (['background', 'midground', 'foreground', 'epiphyte'].includes(position) ? position : 'midground') as 'midground',
				status: 'thriving'
			}, meta);
			return { eventId: p.event.id, message: `✓ ${p.name} added to Plants` };
		}
		const count = num(form, 'count') ?? 1;
		if (!Number.isInteger(count) || count < 1) return { errors: { count: 'Enter a whole number.' } };
		const { row, event } = addLivestock(
			user.id,
			tank.id,
			{
				kind: kind === 'invert' || kind === 'coral' ? kind : 'fish',
				commonName: name,
				scientificName: optStr(form, 'scientificName', 120),
				count,
				status: str(form, 'status') === 'quarantine' ? 'quarantine' : 'in_tank',
				addedAt: dateInZone(at, user.timeZone),
				source: null
			},
			meta
		);
		return { eventId: event.id, message: `✓ Added ${count} ${row.commonName}` };
	}

	if (action === 'removed' || action === 'moved') {
		const [type, id] = str(form, 'target').split(':');
		if (!id) return { errors: { target: 'Choose which one.' } };
		if (type === 'plant') {
			const p = getPlant(user.id, id);
			if (p.tankId !== tank.id) return { errors: { target: 'Choose which one.' } };
			if (action === 'moved') {
				form.set('name', p.name); // "Moved" is saved as a plain event, which needs the name
				return null;
			}
			const r = removePlant(user.id, id, meta);
			return { eventId: r.event.id, message: `${r.name} removed from Plants` };
		}
		const l = getLivestock(user.id, id);
		if (l.tankId !== tank.id) return { errors: { target: 'Choose which one.' } };
		if (action === 'moved') {
			form.set('name', l.commonName);
			return null;
		}
		const n = num(form, 'count') ?? 1;
		if (!Number.isInteger(n) || n < 1 || n > l.count) return { errors: { count: `Enter 1 to ${l.count}.` } };
		const reason = str(form, 'reason') === 'rehomed' ? 'rehomed' : 'loss';
		const r = changeCount(user.id, id, l.count - n, reason, meta);
		return { eventId: r.event?.id ?? '', message: `✓ ${l.commonName} ${l.count} → ${l.count - n}` };
	}
	return null;
}
