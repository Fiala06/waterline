import { redirect } from '@sveltejs/kit';
import { eventKindLabel, eventTitle } from '$lib/events';
import { setFlash } from '$lib/server/flash';
import { deletePhoto, getPhoto, setCover, tankPhotos } from '$lib/server/photos';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const photo = getPhoto(user.id, params.id);
	const tank = getTank(user.id, photo.tankId);
	const all = tankPhotos(user.id, tank.id);
	const i = all.findIndex((r) => r.photo.id === photo.id);
	const { event, test } = all[i];
	const when = new Date(photo.takenAt).toLocaleString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZone: user.timeZone
	});
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
	return {
		photo: { id: photo.id, width: photo.width, height: photo.height, isCover: tank.coverPhotoId === photo.id },
		tankId: tank.id,
		position: `${i + 1} of ${all.length}`,
		prev: i > 0 ? all[i - 1].photo.id : null,
		next: i < all.length - 1 ? all[i + 1].photo.id : null,
		when: entry ? `${when} · ${entry.kind}` : when,
		entry
	};
};

export const actions: Actions = {
	cover: ({ locals, params, cookies }) => {
		setCover(locals.user!.id, params.id);
		setFlash(cookies, '✓ Set as tank cover');
		redirect(303, `/photos/${params.id}`);
	},
	delete: ({ locals, params, cookies }) => {
		deletePhoto(locals.user!.id, params.id);
		setFlash(cookies, 'Photo deleted');
		redirect(303, '/photos');
	}
};
