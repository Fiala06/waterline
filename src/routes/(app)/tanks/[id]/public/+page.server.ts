import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { photos } from '$lib/server/db/schema';
import { optStr, str } from '$lib/server/forms';
import { displayNameFor, getPublicPage, publicSettings, slugify, updatePublicPage, viewsThisWeek } from '$lib/server/public';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

// P1 (what shows) + P4 (search & sharing) for one tank.
export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id);
	const page = getPublicPage(user.id, tank.id);
	const s = publicSettings();
	const base = s.baseUrl ?? url.origin;
	return {
		tank: { id: tank.id, name: tank.name, hasCover: !!tank.coverPhotoId },
		page,
		allowed: s.allowPublicPages,
		base,
		host: new URL(base).host,
		views: viewsThisWeek(tank.id),
		names: {
			full: displayNameFor(user, 'full') ?? 'Your name',
			short: displayNameFor(user, 'short') ?? 'Your name'
		},
		photos: db.select({ id: photos.id }).from(photos).where(eq(photos.tankId, tank.id)).orderBy(desc(photos.takenAt)).limit(24).all()
	};
};

const on = (form: FormData, k: string) => form.get(k) === 'on';

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		const user = locals.user!;
		const form = await request.formData();
		const seoTitle = optStr(form, 'seoTitle', 60);
		const seoDescription = optStr(form, 'seoDescription', 160);
		const displayName = str(form, 'displayName');
		const ogPhotoId = optStr(form, 'ogPhotoId', 64);
		const result = updatePublicPage(user.id, params.id, {
			enabled: on(form, 'enabled'),
			slug: slugify(str(form, 'slug')),
			showReadings: on(form, 'showReadings'),
			showCharts: on(form, 'showCharts'),
			showPhotos: on(form, 'showPhotos'),
			showLivestock: on(form, 'showLivestock'),
			showEquipment: on(form, 'showEquipment'),
			showActivity: on(form, 'showActivity'),
			showDescription: on(form, 'showDescription'),
			description: optStr(form, 'description', 1000),
			displayName: displayName === 'full' || displayName === 'none' ? displayName : 'short',
			indexable: on(form, 'indexable'),
			seoTitle,
			seoDescription,
			ogPhotoId:
				ogPhotoId && db.select().from(photos).where(eq(photos.id, ogPhotoId)).get()?.tankId === params.id ? ogPhotoId : null,
			ogPlain: str(form, 'ogStyle') === 'plain'
		});
		if ('error' in result) return fail(400, { slugError: result.error });
		return { saved: true };
	}
};
