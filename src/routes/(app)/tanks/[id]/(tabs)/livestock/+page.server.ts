import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { EQUIPMENT_TYPE_LABEL, equipmentName, specSummary } from '$lib/equipment';
import { eventTitle } from '$lib/events';
import { bySpecies, speciesCount } from '$lib/livestock';
import { dateInZone, fmtDate } from '$lib/time';
import { db } from '$lib/server/db';
import { events } from '$lib/server/db/schema';
import { setFlash } from '$lib/server/flash';
import { num, str } from '$lib/server/forms';
import { changeCount, getLivestock, listEquipment, listLivestock, setLivestockStatus, type CountReason } from '$lib/server/specs';
import { underTreatmentIn } from '$lib/server/log-livestock';
import { speciesPhotos } from '$lib/server/stock-photos';
import { tankTargets, tankWarnings } from '$lib/care';
import { CARE_SOURCE, careFor, speciesCareOn } from '$lib/server/species-care';
import { listParams } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

const month = (d: string | null) =>
	d ? new Date(d.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const view = (l: ReturnType<typeof listLivestock>[number]) => ({
		id: l.id,
		name: l.commonName,
		// a pet: "Captain", shown as "Captain · Betta"
		nickname: l.nickname,
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
	const rows = bySpecies(listLivestock(user.id, params.id));
	// a pet's own photo, else the species photo from Wikimedia Commons (some come in the background)
	const photos = speciesPhotos(rows.map((l) => ({ photoId: l.photoId, scientific: l.scientificName, common: l.commonName })));
	// ▲ on a row whose latest health entry is still watching or treating
	const treating = underTreatmentIn(params.id);
	const items = rows.map((l, i) => ({ ...view(l), photo: photos.list[i]?.src ?? null, health: treating.has(l.id) }));
	const animals = items.reduce((n, l) => n + l.count, 0);
	const species = speciesCount(rows);
	// worth checking (#20): targets against each species' ranges, group sizes, known conflicts
	const warnings = speciesCareOn()
		? tankWarnings(
				rows.map((l) => ({ s: l.scientificName, name: l.commonName, count: l.count })),
				careFor,
				tankTargets(listParams(params.id)),
				user
			)
		: [];
	return {
		warnings,
		careSource: warnings.length ? CARE_SOURCE : null,
		// the tab's toolbar: "23 animals · 4 species"
		toolbarText: items.length ? `${animals} animal${animals === 1 ? '' : 's'} · ${species} species` : '',
		items,
		photosPending: photos.pending,
		past: bySpecies(listLivestock(user.id, params.id, { removed: true })).map(view),
		animals,
		species,
		equipment: listEquipment(user.id, params.id).map((e) => {
			const name = equipmentName(e);
			// T6: "Tidewell 200 W · 77 °F", not the wattage twice
			const spec = specSummary(e.type, e.specs, user).find((s) => !name.includes(s));
			return { id: e.id, type: EQUIPMENT_TYPE_LABEL[e.type], line: spec ? `${name} · ${spec}` : name };
		}),
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
		if (before.nickname && count > 1) return fail(400, { error: `${before.nickname} is one animal. Add more ${before.commonName} as their own entry.` });
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
