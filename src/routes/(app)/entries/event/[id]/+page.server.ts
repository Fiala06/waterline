import { redirect } from '@sveltejs/kit';
import {
	CATEGORY_LABEL,
	EQUIPMENT_ACTIONS,
	eventTitle,
	LIVESTOCK_ACTIONS,
	LIVESTOCK_STATUS,
	WATER_SOURCES
} from '$lib/events';
import { fmtDate, fmtTime, fmtWhen } from '$lib/time';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { setFlash } from '$lib/server/flash';
import { deleteEvent, getEvent } from '$lib/server/logs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const e = getEvent(user.id, params.id);
	const d = e.data;
	const rows: { label: string; value: string }[] = [];
	const add = (label: string, value: unknown) => {
		if (value != null && value !== '' && !(Array.isArray(value) && !value.length))
			rows.push({ label, value: Array.isArray(value) ? value.join(', ') : String(value) });
	};
	const labelOf = (opts: readonly { value: string; label: string }[], v: unknown) =>
		opts.find((o) => o.value === v)?.label ?? v;

	switch (e.category) {
		case 'water_change':
			add('Amount', typeof d.percent === 'number' ? `${formatNumber(d.percent, 1)}%` : null);
			add(
				'Volume',
				typeof d.volume_l === 'number'
					? `${formatNumber(toDisplay(d.volume_l, 'volume', user), 1)} ${unitLabel('volume', user)}`
					: null
			);
			add('Source water', labelOf(WATER_SOURCES, d.source));
			break;
		case 'dosing':
			add('Product', d.product);
			add('Amount', typeof d.amount === 'number' ? `${formatNumber(d.amount, 2)} ${d.unit ?? ''}` : null);
			break;
		case 'maintenance':
			add('Done', d.actions);
			break;
		case 'livestock':
			add('Change', labelOf(LIVESTOCK_ACTIONS, d.action));
			add('Species', d.name);
			add('Count', d.count);
			add('Status', labelOf(LIVESTOCK_STATUS, d.status));
			break;
		case 'equipment':
			add('Change', labelOf(EQUIPMENT_ACTIONS, d.action));
			add('Item', d.item);
			add('Why', d.reasons);
			break;
		case 'observation':
			add('Noticed', d.tags);
			add('Check again', typeof d.recheck_at === 'string' ? fmtDate(d.recheck_at) : null);
			break;
	}
	return {
		entry: {
			id: e.id,
			tankId: e.tankId,
			title: eventTitle(e, user),
			kind: CATEGORY_LABEL[e.category],
			when: fmtWhen(e.occurredAt, user.timeZone),
			edited: e.editedAt ? fmtTime(e.editedAt, user.timeZone) : null,
			note: e.note,
			rows,
			editable: !(e.category === 'note' && d.system)
		}
	};
};

export const actions: Actions = {
	delete: ({ locals, params, cookies }) => {
		const e = deleteEvent(locals.user!.id, params.id);
		setFlash(cookies, 'Entry deleted');
		redirect(303, `/?tank=${e.tankId}`);
	}
};
