// View data for one entry (water test or event): used by the entry pages
// and the desktop History detail pane.
import {
	CATEGORY_LABEL,
	EQUIPMENT_ACTIONS,
	eventTitle,
	LIVESTOCK_ACTIONS,
	LIVESTOCK_STATUS,
	WATER_SOURCES
} from '$lib/events';
import { fmtValue, paramUnit, statusOf } from '$lib/params';
import { statusMedium } from '$lib/status';
import { amountText } from '$lib/tasks';
import { dateInZone, fmtDate, fmtTime, fmtWhen } from '$lib/time';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import type { User } from './db/schema';
import { getEvent, getTest } from './logs';
import { entryPhotos } from './photos';
import { listParams } from './tanks';

/**
 * Whether the event form can edit this entry. System notes and automatic
 * livestock entries (recounts, status changes) have no form fields to edit.
 */
export function eventEditable(e: { category: string; data: Record<string, unknown> }) {
	if (e.category === 'note') return !e.data.system;
	if (e.category === 'livestock') return LIVESTOCK_ACTIONS.some((a) => a.value === e.data.action);
	return true;
}

export interface EntryView {
	kind: 'test' | 'event';
	id: string;
	tankId: string;
	title: string;
	kindLabel: string;
	when: string;
	day: string;
	edited: string | null;
	note: string | null;
	rows: { label: string; value: string; statusText?: string; level?: string }[];
	photos: { id: string }[];
	editable: boolean;
	href: string;
}

export function testView(user: User, id: string): EntryView {
	const { test, readings, previous } = getTest(user.id, id);
	const rows = listParams(test.tankId, { all: true })
		.filter((p) => readings.has(p.id))
		.map((p) => {
			const v = readings.get(p.id)!;
			const st = statusOf(p, v);
			const unit = paramUnit(p, user);
			const was = previous.get(p.id);
			return {
				label: p.name,
				value: `${fmtValue(p, v, user)}${unit ? ' ' + unit : ''}`,
				statusText: `${statusMedium(st)}${was != null ? ` · was ${fmtValue(p, was, user)}` : ''}`,
				level: st.level
			};
		});
	return {
		kind: 'test',
		id: test.id,
		tankId: test.tankId,
		title: `Water test · ${rows.length} reading${rows.length === 1 ? '' : 's'}`,
		kindLabel: 'Water test',
		when: fmtWhen(test.takenAt, user.timeZone),
		day: fmtDate(dateInZone(test.takenAt, user.timeZone)),
		edited: test.editedAt ? fmtTime(test.editedAt, user.timeZone) : null,
		note: test.note,
		rows,
		photos: entryPhotos({ testId: test.id }).map((p) => ({ id: p.id })),
		editable: true,
		href: `/entries/test/${test.id}`
	};
}

export function eventView(user: User, id: string): EntryView {
	const e = getEvent(user.id, id);
	const d = e.data;
	const rows: EntryView['rows'] = [];
	const add = (label: string, value: unknown) => {
		if (value != null && value !== '' && !(Array.isArray(value) && !value.length))
			rows.push({ label, value: Array.isArray(value) ? value.join(', ') : String(value) });
	};
	const labelOf = (opts: readonly { value: string; label: string }[], v: unknown) => opts.find((o) => o.value === v)?.label ?? v;

	switch (e.category) {
		case 'water_change':
			add('Amount', typeof d.percent === 'number' ? `${formatNumber(d.percent, 1)}%` : null);
			add(
				'Volume',
				typeof d.volume_l === 'number' ? `${formatNumber(toDisplay(d.volume_l, 'volume', user), 1)} ${unitLabel('volume', user)}` : null
			);
			add('Source water', labelOf(WATER_SOURCES, d.source));
			break;
		case 'dosing':
			add('Product', d.product);
			add('Amount', typeof d.amount === 'number' ? `${formatNumber(d.amount, 2)} ${d.unit ?? ''}` : null);
			break;
		case 'feeding':
			add('Food', d.food);
			add('Amount', typeof d.amount === 'number' ? amountText(d.amount, typeof d.unit === 'string' ? d.unit : null) : null);
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
		kind: 'event',
		id: e.id,
		tankId: e.tankId,
		title: eventTitle(e, user),
		kindLabel: CATEGORY_LABEL[e.category],
		when: fmtWhen(e.occurredAt, user.timeZone),
		day: fmtDate(dateInZone(e.occurredAt, user.timeZone)),
		edited: e.editedAt ? fmtTime(e.editedAt, user.timeZone) : null,
		note: e.note,
		rows,
		photos: entryPhotos({ eventId: e.id }).map((p) => ({ id: p.id })),
		editable: eventEditable(e),
		href: `/entries/event/${e.id}`
	};
}
