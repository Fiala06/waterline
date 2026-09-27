import { redirect } from '@sveltejs/kit';
import { eventKindLabel, eventTitle } from '$lib/events';
import { setFlash } from '$lib/server/flash';
import { deletePhoto, getPhoto, setCover, tankPhotos } from '$lib/server/photos';
import { getTank } from '$lib/server/tanks';
import { listLivestock, photoPets, tagPhoto } from '$lib/server/specs';
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
	const pub = publicSettings();
	const share = pub.allowPublicPages ? getShareForPhoto(user.id, photo.id) : null;
	return {
		sharing: pub.allowPublicPages
			? { share: share ? { id: share.id, includeNote: share.includeNote, includeTank: share.includeTank } : null, base: pub.baseUrl ?? url.origin }
			: null,
		photo: { id: photo.id, width: photo.width, height: photo.height, isCover: tank.coverPhotoId === photo.id },
		tankId: tank.id,
		position: `${i + 1} of ${all.length}`,
		prev: i > 0 ? all[i - 1].photo.id : null,
		next: i < all.length - 1 ? all[i + 1].photo.id : null,
		when: entry ? `${when} · ${entry.kind}` : when,
		entry,
		pets
	};
};

export const actions: Actions = {
	cover: ({ locals, params, cookies }) => {
		setCover(locals.user!.id, params.id);
		setFlash(cookies, '✓ Set as tank cover');
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
	unshare: ({ locals, params, cookies }) => {
		revokeShare(locals.user!.id, params.id);
		setFlash(cookies, 'Public link turned off');
		redirect(303, `/photos/${params.id}`);
	},
	delete: ({ locals, params, cookies }) => {
		deletePhoto(locals.user!.id, params.id);
		setFlash(cookies, 'Photo deleted');
		redirect(303, '/photos');
	}
};
