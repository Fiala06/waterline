import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { EQUIPMENT_TYPE_LABEL, equipmentName, specSummary } from '$lib/equipment';
import { eventTitle } from '$lib/events';
import { dateInZone, fmtDate } from '$lib/time';
import { db } from '$lib/server/db';
import { events } from '$lib/server/db/schema';
import { setFlash } from '$lib/server/flash';
import { num, str } from '$lib/server/forms';
import { changeCount, getLivestock, listEquipment, listLivestock, setLivestockStatus, type CountReason } from '$lib/server/specs';
import type { Actions, PageServerLoad } from './$types';

const month = (d: string | null) =>
	d ? new Date(d.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const view = (l: ReturnType<typeof listLivestock>[number]) => ({
		id: l.id,
		name: l.commonName,
		scientific: l.scientificName,
		kind: l.kind,
		count: l.count,
		status: l.status,
		added: month(l.addedAt)
	});
	const recent = db
		.select()
		.from(events)
		.where(and(eq(events.tankId, params.id), inArray(events.category, ['livestock', 'equipment'])))
		.orderBy(desc(events.occurredAt))
		.limit(6)
		.all()
		.map((e) => ({ id: e.id, title: eventTitle(e, user), day: fmtDate(dateInZone(e.occurredAt, user.timeZone)) }));
	const items = listLivestock(user.id, params.id).map(view);
	return {
		items,
		past: listLivestock(user.id, params.id, { removed: true }).map(view),
		animals: items.reduce((n, l) => n + l.count, 0),
		equipment: listEquipment(user.id, params.id).map((e) => ({
			id: e.id,
			type: EQUIPMENT_TYPE_LABEL[e.type],
			line: [equipmentName(e), ...specSummary(e.type, e.specs, user).slice(0, 1)].join(' · ')
		})),
		recent
	};
};

export const actions: Actions = {
	count: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const id = str(form, 'id');
		const count = num(form, 'count');
		const reason = str(form, 'reason') as CountReason;
		if (count == null || count < 0 || !Number.isInteger(count)) return fail(400, { error: 'Enter a whole number.' });
		if (!['loss', 'rehomed', 'recount', 'added'].includes(reason)) return fail(400, { error: 'Choose why the count changed.' });
		const before = getLivestock(user.id, id);
		if (before.tankId !== params.id) return fail(404);
		changeCount(user.id, id, count, reason);
		setFlash(cookies, `✓ ${before.commonName} ${before.count} → ${count}`);
		redirect(303, `/tanks/${params.id}/livestock`);
	},
	status: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const l = setLivestockStatus(locals.user!.id, str(form, 'id'), str(form, 'status') === 'quarantine' ? 'quarantine' : 'in_tank');
		setFlash(cookies, `✓ ${l.commonName} moved into the tank`);
		redirect(303, `/tanks/${params.id}/livestock`);
	}
};
