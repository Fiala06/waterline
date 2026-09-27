import { error, fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { eventTitle } from '$lib/events';
import { dateInZone, fmtDate, fmtDateLong } from '$lib/time';
import { db } from '$lib/server/db';
import { events } from '$lib/server/db/schema';
import { setFlash } from '$lib/server/flash';
import { optStr } from '$lib/server/forms';
import { checkPhotoFiles, photoFiles, preparePhotos, storePhotos } from '$lib/server/photos';
import { getLivestock, nameLivestock, updateLivestockDetails } from '$lib/server/specs';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

// A page per livestock entry: a pet ("Captain · Betta") or a species' group.
// Its photo, notes and its own History; naming one of a group gives it a page of its own.

function entry(userId: string, tankId: string, id: string) {
	const l = getLivestock(userId, id);
	if (l.tankId !== tankId) error(404, 'Livestock not found');
	return l;
}

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const l = entry(user.id, params.id, params.lid);
	const history = db
		.select()
		.from(events)
		.where(
			and(
				eq(events.tankId, l.tankId),
				eq(events.category, 'livestock'),
				or(sql`json_extract(${events.data}, '$.livestock_id') = ${l.id}`, sql`json_extract(${events.data}, '$.from_id') = ${l.id}`)
			)
		)
		.orderBy(desc(events.occurredAt))
		.limit(50)
		.all()
		.map((e) => ({ id: e.id, title: eventTitle(e, user), day: fmtDate(dateInZone(e.occurredAt, user.timeZone)) }));
	const tank = getTank(user.id, l.tankId);
	return {
		tank: { id: tank.id, name: tank.name },
		animal: {
			id: l.id,
			nickname: l.nickname,
			commonName: l.commonName,
			scientificName: l.scientificName,
			kind: l.kind,
			count: l.count,
			status: l.status,
			added: l.addedAt ? fmtDateLong(l.addedAt.slice(0, 10)) : null,
			left: l.removedAt ? fmtDateLong(dateInZone(l.removedAt, user.timeZone)) : null,
			source: l.source,
			notes: l.notes ?? '',
			photoId: l.photoId
		},
		history
	};
};

const back = (tankId: string, id: string) => `/tanks/${tankId}/livestock/${id}`;

export const actions: Actions = {
	/** The name (for one animal) and the notes. */
	save: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const l = entry(user.id, params.id, params.lid);
		const form = await request.formData();
		if (l.count === 1 && !l.removedAt && form.has('nickname')) nameLivestock(user.id, l.id, optStr(form, 'nickname', 60));
		updateLivestockDetails(user.id, l.id, { notes: optStr(form, 'notes', 4000) });
		setFlash(cookies, '✓ Saved');
		redirect(303, back(params.id, l.id));
	},
	/** Name one of a group: it moves out into its own entry, and its page opens. */
	nameOne: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const l = entry(user.id, params.id, params.lid);
		const nickname = optStr(await request.formData(), 'nickname', 60);
		if (!nickname) return fail(400, { nameError: 'Enter a name.' });
		if (l.removedAt) return fail(400, { nameError: 'These have left the tank.' });
		const pet = nameLivestock(user.id, l.id, nickname);
		setFlash(cookies, `✓ Named ${nickname}`);
		redirect(303, back(params.id, pet.id));
	},
	photo: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const l = entry(user.id, params.id, params.lid);
		const files = photoFiles(await request.formData(), 'photo').slice(0, 1);
		if (!files.length) return fail(400, { photoError: 'Choose a photo.' });
		const tooBig = checkPhotoFiles(files);
		if (tooBig) return fail(400, { photoError: tooBig });
		const prepared = await preparePhotos(files);
		if ('error' in prepared) return fail(400, { photoError: prepared.error });
		// one of the tank's photos, so it's in Photos and the backup too
		const [photo] = storePhotos(l.tankId, prepared, { takenAt: new Date().toISOString() });
		updateLivestockDetails(user.id, l.id, { photoId: photo.id });
		setFlash(cookies, '✓ Photo saved');
		redirect(303, back(params.id, l.id));
	},
	/** Stops using the photo here; it stays in Photos. */
	removePhoto: ({ locals, params, cookies }) => {
		const user = locals.user!;
		const l = entry(user.id, params.id, params.lid);
		updateLivestockDetails(user.id, l.id, { photoId: null });
		setFlash(cookies, '✓ Photo removed · still in Photos');
		redirect(303, back(params.id, l.id));
	}
};
