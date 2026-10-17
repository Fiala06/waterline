import { clampPct } from '$lib/media';
import { fail, redirect } from '@sveltejs/kit';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { setFlash } from '$lib/server/flash';
import { parseTankForm } from '$lib/server/forms';
import { datePhotos, preparePhotos, setCover, storePhotos, tankPhotos } from '$lib/server/photos';
import { dateInZone, fmtDate } from '$lib/time';
import { db } from '$lib/server/db';
import { publicPages } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getTank, listParams, setArchived, setChecklist, updateTank } from '$lib/server/tanks';
import { listTasks } from '$lib/server/tasks';
import { intervalText } from '$lib/tasks';
import { doseText, nextDoseText } from '$lib/growing';
import { parseReviewEvery, REVIEW_INTERVALS } from '$lib/review';
import { checkSection, reviewTask, setReviewEvery } from '$lib/server/review';
import { todayInZone } from '$lib/time';
import { tankDetails } from '$lib/server/tank-details';
import { scheduledItems } from '$lib/server/specs';
import { periodsText, tankLighting } from '$lib/equipment';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id, 'owner');
	const review = reviewTask(tank.id);
	const all = listParams(tank.id, { all: true });
	const tracked = all.filter((p) => p.tracked);
	const v = (x: number | null, q: 'volume' | 'length', d: number) =>
		x == null ? '' : formatNumber(toDisplay(x, q, user), d);
	return {
		// the tank's photos, newest first, to pick a cover from (a shot of the whole tank is usually there already)
		photos: tankPhotos(user.id, tank.id)
			.slice(0, 60)
			.map(({ photo }) => ({ id: photo.id, day: fmtDate(dateInZone(photo.takenAt, user.timeZone)) })),
		tank: {
			id: tank.id,
			name: tank.name,
			type: tank.type,
			archived: !!tank.archivedAt,
			cover: tank.coverPhotoId,
			coverX: tank.coverX,
			coverY: tank.coverY,
			nominalVolume: v(tank.nominalVolumeL, 'volume', 1),
			actualVolume: v(tank.actualVolumeL, 'volume', 1),
			length: v(tank.lengthCm, 'length', 1),
			width: v(tank.widthCm, 'length', 1),
			height: v(tank.heightCm, 'length', 1),
			startDate: tank.startDate ?? '',
			notes: tank.notes ?? '',
			specBrand: tank.specBrand ?? '',
			specModel: tank.specModel ?? '',
			glass: tank.glass ?? '',
			substrate: tank.substrate ?? '',
			waterSource: tank.waterSource ?? '',
			growingStyle: tank.growingStyle ?? '',
			photoperiodH: tank.photoperiodH == null ? '' : String(tank.photoperiodH),
			lightsOn: tank.lightsOn ?? '',
			lightsOff: tank.lightsOff ?? '',
			co2On: tank.co2On ?? '',
			co2Off: tank.co2Off ?? '',
			cycling: tank.cycling
		},
		// the lights' and CO₂'s times set on an equipment item's schedule (#25): shown here, changed there
		lighting: (() => {
			const l = tankLighting(tank, scheduledItems(tank.id));
			const from = (x: typeof l.lights) => (x?.item ? { text: periodsText(x.schedule), hours: x.hours, item: { id: x.item.id, name: x.item.name } } : null);
			return { lights: from(l.lights), co2: from(l.co2) };
		})(),
		// a planted tank's fertilizer routines (#96), listed with its growing setup
		dosing:
			tank.type === 'planted'
				? listTasks(user.id, tank.id)
						.filter((r) => r.task.kind === 'dosing')
						.map((r) => ({ id: r.task.id, text: doseText({ ...r.task, title: r.task.name }), interval: intervalText(r.task), next: nextDoseText(r.task.due, todayInZone(user.timeZone)) }))
				: [],
		paramSummary: {
			tracked: tracked.length,
			custom: all.filter((p) => p.isCustom).length,
			names: tracked.map((p) => p.name).join(', ')
		},
		// the setup review (#30): how often, or off; and whether Save goes back to it
		review: {
			every: review ? String(review.intervalDays) : 'off',
			custom: review && !REVIEW_INTERVALS.some((r) => r.days === review.intervalDays) ? review.intervalDays : null,
			due: review?.nextDue ?? null
		},
		fromReview: url.searchParams.get('from') === 'review',
		publicLive: !!db.select().from(publicPages).where(eq(publicPages.tankId, tank.id)).get()?.enabled,
		today: todayInZone(user.timeZone),
		// specs, the pinned note, recent notes and routines, shown after the form
		details: tankDetails(user, tank),
		volUnit: unitLabel('volume', user),
		lenUnit: unitLabel('length', user)
	};
};

export const actions: Actions = {
	// the getting-started checklist, back on the dashboard (#82)
	showChecklist: async ({ locals, params, cookies }) => {
		setChecklist(locals.user!.id, params.id, 'shown');
		setFlash(cookies, '✓ The checklist is back on the dashboard');
		redirect(303, `/?tank=${params.id}`);
	},
	save: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const { errors, values } = parseTankForm(form, user);
		if (Object.keys(errors).length) return fail(400, { errors });
		const cover = form.get('cover');
		const prepared = cover instanceof File && cover.size ? await preparePhotos([cover]) : [];
		if ('error' in prepared) return fail(400, { errors: { cover: prepared.error } });
		updateTank(user.id, params.id, values);
		const [photo] = await storePhotos(params.id, datePhotos(prepared, user.timeZone), { takenAt: new Date().toISOString() });
		if (photo) setCover(user.id, photo.id);
		// or one of the tank's own photos, picked under Choose from photos (an upload wins)
		const chosen = String(form.get('coverPhotoId') ?? '');
		if (!photo && chosen && tankPhotos(user.id, params.id).some((r) => r.photo.id === chosen)) setCover(user.id, chosen);
		// where the cover sits in its frame, as dragged (a new photo's too)
		if (form.has('coverX') || form.has('coverY')) {
			updateTank(user.id, params.id, { coverX: clampPct(form.get('coverX')), coverY: clampPct(form.get('coverY')) });
		}
		const every = parseReviewEvery(form.get('reviewEvery'));
		if (every != null) setReviewEvery(user, params.id, every);
		setFlash(cookies, '✓ Tank saved');
		// from the setup review: saved means the details are right now, and back to it
		if (form.get('from') === 'review') {
			checkSection(user.id, params.id, 'details');
			redirect(303, `/tanks/${params.id}/review#details`);
		}
		redirect(303, `/tanks/${params.id}/settings`); // stay on the tab, like the other tank tabs
	},
	archive: async ({ locals, params, cookies }) => {
		const tank = getTank(locals.user!.id, params.id, 'owner');
		setArchived(locals.user!.id, params.id, true);
		cookies.delete('wl_tank', { path: '/' });
		setFlash(cookies, `${tank.name} archived`);
		redirect(303, '/tanks');
	}
};
