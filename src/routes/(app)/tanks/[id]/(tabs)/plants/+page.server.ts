import { getTank } from '$lib/server/tanks';
import { fail, redirect } from '@sveltejs/kit';
import { dateInZone, fmtDate } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { optStr, str } from '$lib/server/forms';
import { checkPhotoFiles, photoFiles, datePhotos, preparePhotos, storePhotos } from '$lib/server/photos';
import { addPlant, getPlant, listPlants, logTrim, removePlant, updatePlant } from '$lib/server/specs';
import { speciesPhotos, stockPhotosOn } from '$lib/server/stock-photos';
import { readSort, sortRows } from '$lib/sort';
import type { Actions, PageServerLoad } from './$types';

const POSITIONS = ['background', 'midground', 'foreground', 'epiphyte', 'floating'] as const;
const STATUSES = ['thriving', 'melting', 'algae', 'other'] as const;
/** The columns a keeper can sort by (#79), and the order placement and status sort in */
const SORTS = ['plant', 'placement', 'added', 'trimmed', 'status'] as const;
const PLACEMENT_RANK: Record<string, number> = { floating: 0, background: 1, midground: 2, epiphyte: 3, foreground: 4 };
const STATUS_RANK: Record<string, number> = { thriving: 0, other: 1, melting: 2, algae: 3 };

const pick = <T extends string>(v: string, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const sort = readSort(url, SORTS);
	const list = sortRows(listPlants(user.id, params.id), sort, (p, k) =>
		k === 'plant' ? p.name : k === 'placement' ? PLACEMENT_RANK[p.position] : k === 'added' ? p.createdAt : k === 'trimmed' ? p.lastTrimmedAt : STATUS_RANK[p.status]
	);
	// the keeper's own photo, else a species photo from Wikimedia Commons (some come in the background)
	const photos = speciesPhotos(list.map((p) => ({ photoId: p.photoId, scientific: p.scientificName, common: p.name })));
	return {
		// the tab's toolbar: "6 plants"
		toolbarText: list.length ? `${list.length} plant${list.length === 1 ? '' : 's'}` : '',
		// the Added column says something only when the dates differ (an import gives them all one day)
		showAdded: new Set(list.map((p) => dateInZone(p.createdAt, user.timeZone))).size > 1,
		plants: list.map((p, i) => ({
			id: p.id,
			name: p.name,
			scientific: p.scientificName,
			position: p.position,
			status: p.status,
			trimmed: p.lastTrimmedAt ? fmtDate(dateInZone(p.lastTrimmedAt, user.timeZone)) : null,
			added: fmtDate(dateInZone(p.createdAt, user.timeZone)),
			photo: photos.list[i],
			ownPhoto: !!p.photoId
		})),
		sort,
		photosPending: photos.pending,
		stockPhotos: stockPhotosOn()
	};
};

export const actions: Actions = {
	add: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const name = str(form, 'name').slice(0, 80);
		if (!name) return fail(400, { error: 'Enter the plant.' });
		const p = addPlant(locals.user!.id, params.id, {
			name,
			scientificName: optStr(form, 'scientificName', 120),
			position: pick(str(form, 'position'), POSITIONS, 'midground'),
			status: pick(str(form, 'status'), STATUSES, 'thriving')
		});
		setFlash(cookies, `✓ ${p.name} added`);
		redirect(303, `/tanks/${params.id}/plants`);
	},
	update: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const id = str(form, 'id');
		if (getPlant(locals.user!.id, id).tankId !== params.id) return fail(404);
		updatePlant(locals.user!.id, id, {
			position: pick(str(form, 'position'), POSITIONS, 'midground'),
			status: pick(str(form, 'status'), STATUSES, 'thriving')
		});
		setFlash(cookies, '✓ Plant saved');
		redirect(303, `/tanks/${params.id}/plants`);
	},
	/** The keeper's own photo of a plant: one of the tank's photos, so it's in Photos and the backup too. */
	photo: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const id = str(form, 'id');
		if (getPlant(locals.user!.id, id).tankId !== params.id) return fail(404);
		getTank(locals.user!.id, params.id, 'log');
		const files = photoFiles(form, 'photo').slice(0, 1);
		if (!files.length) return fail(400, { error: 'Choose a photo.' });
		const tooBig = checkPhotoFiles(files);
		if (tooBig) return fail(400, { error: tooBig });
		const prepared = await preparePhotos(files);
		if ('error' in prepared) return fail(400, { error: prepared.error });
		const [photo] = storePhotos(params.id, datePhotos(prepared, locals.user!.timeZone), { takenAt: new Date().toISOString() });
		updatePlant(locals.user!.id, id, { photoId: photo.id });
		setFlash(cookies, '✓ Photo saved');
		redirect(303, `/tanks/${params.id}/plants`);
	},
	/** Back to the species photo; the keeper's photo stays in Photos. */
	removePhoto: async ({ request, locals, params, cookies }) => {
		const id = str(await request.formData(), 'id');
		if (getPlant(locals.user!.id, id).tankId !== params.id) return fail(404);
		updatePlant(locals.user!.id, id, { photoId: null });
		setFlash(cookies, 'Photo removed · it stays in Photos');
		redirect(303, `/tanks/${params.id}/plants`);
	},
	remove: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const p = removePlant(locals.user!.id, str(form, 'id'));
		setFlash(cookies, `${p.name} removed`);
		redirect(303, `/tanks/${params.id}/plants`);
	},
	trim: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const ids = form.getAll('plant').map(String);
		if (!ids.length) return fail(400, { error: 'Choose the plants you trimmed.' });
		logTrim(locals.user!.id, params.id, ids, optStr(form, 'note'));
		setFlash(cookies, `✓ Trim logged · ${ids.length} plant${ids.length === 1 ? '' : 's'}`);
		redirect(303, `/tanks/${params.id}/plants`);
	}
};
