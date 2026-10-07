import { fail, redirect } from '@sveltejs/kit';
import { eventKindLabel, eventTitle } from '$lib/events';
import { utcToZoned } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { parseWhen } from '$lib/server/forms';
import { deletePhoto, getPhoto, setCover, setInTimeline, setPhotoDate, tankPhotos } from '$lib/server/photos';
import { getTank, updateTank } from '$lib/server/tanks';
import { getLivestock, getPlant, listLivestock, listPlants, photoPets, tagPhoto, updateLivestockDetails, updatePlant } from '$lib/server/specs';
import { livestockLabel } from '$lib/livestock';
import { createShare, getShareForPhoto, publicSettings, revokeShare, updateShare } from '$lib/server/public';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const photo = getPhoto(user.id, params.id);
	const tank = getTank(user.id, photo.tankId);
	const all = tankPhotos(user.id, tank.id);
	const i = all.findIndex((r) => r.photo.id === photo.id);
	const { event, test } = all[i];
	// "Mon Sep 22, 6:40 PM" (13b, D8)
	const when = new Date(photo.takenAt)
		.toLocaleString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			timeZone: user.timeZone
		})
		.replace(',', '');
	const entry = event
		? {
				href: `/entries/event/${event.id}`,
				kind: eventKindLabel(event),
				title: event.category === 'note' && !event.note ? null : eventTitle(event, user),
				note: event.category === 'note' ? null : event.note
			}
		: test
			? { href: `/entries/test/${test.id}`, kind: 'Water test', title: 'Water test', note: test.note }
			: null;
	// "In this photo": the tank's named pets, and any already tagged (even one that has left)
	const tagged = new Set(photoPets(photo.id));
	const pets = [...listLivestock(user.id, tank.id), ...listLivestock(user.id, tank.id, { removed: true })]
		.filter((l) => (l.nickname && !l.removedAt) || tagged.has(l.id))
		.map((l) => ({ id: l.id, name: l.nickname ?? l.commonName, species: l.commonName, tagged: tagged.has(l.id) }));
	// "Use as the photo for": the tank's plants and animals, and which already use this one
	const inTank = listLivestock(user.id, tank.id);
	const plantList = listPlants(user.id, tank.id);
	const subjects = [
		...plantList.map((p) => ({ value: `plant:${p.id}`, label: p.name, group: 'Plants', uses: p.photoId === photo.id })),
		...inTank.map((l) => ({ value: `animal:${l.id}`, label: livestockLabel(l), group: 'Livestock', uses: l.photoId === photo.id }))
	];
	const pub = publicSettings();
	const share = pub.allowPublicPages ? getShareForPhoto(user.id, photo.id) : null;
	return {
		sharing: pub.allowPublicPages
			? { share: share ? { id: share.id, includeNote: share.includeNote, includeTank: share.includeTank } : null, base: pub.baseUrl ?? url.origin }
			: null,
		photo: { id: photo.id, width: photo.width, height: photo.height, isCover: tank.coverPhotoId === photo.id, inTimeline: photo.inTimeline },
		tankId: tank.id,
		position: `${i + 1} of ${all.length}`,
		prev: i > 0 ? all[i - 1].photo.id : null,
		next: i < all.length - 1 ? all[i + 1].photo.id : null,
		when: entry ? `${when} · ${entry.kind}` : when,
		// Change date (#42): the date taken as the keeper's wall clock, to fix afterwards
		taken: utcToZoned(photo.takenAt, user.timeZone),
		today: utcToZoned(new Date(), user.timeZone).date,
		entry,
		pets,
		subjects: subjects.map(({ uses, ...s }) => s),
		usedFor: subjects.filter((s) => s.uses).map((s) => s.label)
	};
};

export const actions: Actions = {
	cover: ({ locals, params, cookies }) => {
		const user = locals.user!;
		const photo = getPhoto(user.id, params.id);
		const before = getTank(user.id, photo.tankId);
		setCover(user.id, params.id);
		// Undo puts the cover before back (or none), where it was
		setFlash(cookies, '✓ Cover set', {
			undo: { action: `/photos/${params.id}?/uncover`, name: 'previous', value: [before.coverPhotoId ?? '', before.coverX, before.coverY].join(',') }
		});
		redirect(303, `/photos/${params.id}`);
	},
	/** Undo of Set as cover: the cover from before, or none. */
	uncover: async ({ locals, params, request, cookies }) => {
		const user = locals.user!;
		const photo = getPhoto(user.id, params.id);
		const [prev = '', x = '50', y = '50'] = String((await request.formData()).get('previous') ?? '').split(',');
		const pct = (s: string) => Math.min(100, Math.max(0, Number(s) || 50));
		// only a photo of this tank can be its cover again
		const back = prev && tankPhotos(user.id, photo.tankId).some((r) => r.photo.id === prev) ? prev : null;
		updateTank(user.id, photo.tankId, { coverPhotoId: back, coverX: pct(x), coverY: pct(y) });
		setFlash(cookies, back ? 'Cover put back' : 'Cover removed');
		redirect(303, `/photos/${params.id}`);
	},
	share: ({ locals, params }) => {
		createShare(locals.user!.id, params.id);
		return { shared: true };
	},
	shareOptions: async ({ locals, params, request }) => {
		const form = await request.formData();
		updateShare(locals.user!.id, params.id, { includeNote: form.get('includeNote') === 'on', includeTank: form.get('includeTank') === 'on' });
		return { shared: true };
	},
	/** Tag a pet in the photo, or untag it. */
	tag: async ({ locals, params, request }) => {
		const form = await request.formData();
		tagPhoto(locals.user!.id, params.id, String(form.get('livestockId') ?? ''), form.get('on') === '1');
		return { tagged: true };
	},
	/** This photo as a plant's or an animal's own photo, in place of the species photo. */
	useFor: async ({ locals, params, request, cookies }) => {
		const user = locals.user!;
		const photo = getPhoto(user.id, params.id);
		const [kind, id] = String((await request.formData()).get('for') ?? '').split(':');
		if (kind === 'plant') {
			const p = getPlant(user.id, id);
			if (p.tankId !== photo.tankId) return { error: 'That plant is in another tank.' };
			updatePlant(user.id, p.id, { photoId: photo.id });
			setFlash(cookies, `✓ The photo for ${p.name}`);
		} else if (kind === 'animal') {
			const l = getLivestock(user.id, id);
			if (l.tankId !== photo.tankId) return { error: 'That animal is in another tank.' };
			updateLivestockDetails(user.id, l.id, { photoId: photo.id });
			setFlash(cookies, `✓ The photo for ${livestockLabel(l)}`);
		} else return { error: 'Choose a plant or an animal.' };
		redirect(303, `/photos/${params.id}`);
	},
	/** Change date (#42): fix when the photo was taken; from then on it no longer follows its entry's date. */
	date: async ({ locals, params, request, cookies }) => {
		const user = locals.user!;
		const when = parseWhen(await request.formData(), user.timeZone);
		if ('error' in when) return fail(400, { dateError: when.error });
		setPhotoDate(user.id, params.id, when.at);
		setFlash(cookies, '✓ Date changed');
		redirect(303, `/photos/${params.id}`);
	},
	unshare: ({ locals, params, cookies }) => {
		revokeShare(locals.user!.id, params.id);
		setFlash(cookies, 'Public link turned off');
		redirect(303, `/photos/${params.id}`);
	},
	/** In or out of the tank's timeline (#26): a close-up that doesn't show the tank changing stays out. */
	timeline: async ({ locals, params, request, cookies }) => {
		const on = (await request.formData()).get('on') === '1';
		setInTimeline(locals.user!.id, params.id, on);
		setFlash(cookies, on ? '✓ In the timeline' : 'Left out of the timeline');
		redirect(303, `/photos/${params.id}`);
	},
	delete: async ({ locals, params, cookies }) => {
		await deletePhoto(locals.user!.id, params.id);
		setFlash(cookies, 'Photo deleted');
		redirect(303, '/photos');
	}
};
