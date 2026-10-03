import { error, redirect } from '@sveltejs/kit';
import { EQUIPMENT_TYPE_LABEL, equipmentName, isWithoutType, withoutLabel } from '$lib/equipment';
import { bySpecies, livestockLabel } from '$lib/livestock';
import { fmtRange } from '$lib/params';
import { isReviewSection, isServiced, REVIEW_SECTIONS, reviewEvery, sectionChecked, serviceFlag, type ReviewSection } from '$lib/review';
import { dateInZone, fmtDate, todayInZone } from '$lib/time';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { changedSince, checkSection, finishReview, lastReviewAt, reviewTask, servicedToday } from '$lib/server/review';
import { listEquipment, listLivestock, listPlants } from '$lib/server/specs';
import { getTank, listParams } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

// Review tank setup (#30): every few months, is everything Waterline knows
// about the tank still right? Each part can be confirmed (✓ Still right) or
// fixed (Edit, which comes back here); All still right finishes the review.

const SOURCES: Record<string, string> = { tap: 'Tap', rodi: 'RODI', mix: 'Mix', well: 'Well' };

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id);
	const today = todayInZone(user.timeZone);
	const day = (iso: string) => fmtDate(dateInZone(iso, user.timeZone));
	const last = lastReviewAt(tank.id);
	const changed = changedSince(tank.id, last ?? tank.createdAt);
	const task = reviewTask(tank.id);

	const vol = (l: number | null) => (l == null ? null : `${formatNumber(toDisplay(l, 'volume', user), 0)} ${unitLabel('volume', user)}`);
	const len = (cm: number) => formatNumber(toDisplay(cm, 'length', user), 0);
	const size =
		tank.lengthCm && tank.widthCm && tank.heightCm ? `${len(tank.lengthCm)} × ${len(tank.widthCm)} × ${len(tank.heightCm)} ${unitLabel('length', user)}` : null;
	const details: [string, string | null][] = [
		['Photoperiod', tank.photoperiodH != null ? `${tank.photoperiodH} h` : null],
		['Lights', tank.lightsOn && tank.lightsOff ? `${tank.lightsOn}–${tank.lightsOff}` : null],
		['CO₂', tank.co2On && tank.co2Off ? `${tank.co2On}–${tank.co2Off}` : null],
		['Substrate', tank.substrate],
		['Water source', tank.waterSource ? (SOURCES[tank.waterSource] ?? tank.waterSource) : null],
		['Volume', vol(tank.actualVolumeL ?? tank.nominalVolumeL)],
		['Size', size],
		['Tank', [tank.specBrand, tank.specModel].filter(Boolean).join(' ') || null]
	];

	const section = (key: ReviewSection) => ({
		key,
		label: REVIEW_SECTIONS.find((s) => s.key === key)!.label,
		checked: sectionChecked(tank.reviewChecks, key, last),
		checkedOn: tank.reviewChecks[key] ? day(tank.reviewChecks[key]!) : null,
		changed: changed.includes(key)
	});

	return {
		tank: { id: tank.id, name: tank.name },
		lastReview: last ? day(last) : null,
		task: task ? { due: task.nextDue, every: reviewEvery(task.intervalDays) ?? `every ${task.intervalDays} days` } : null,
		today,
		sections: REVIEW_SECTIONS.map((s) => section(s.key)),
		details,
		// "No heater", "No CO₂": what it goes without on purpose
		without: tank.withoutEquipment.filter(isWithoutType).map(withoutLabel),
		equipment: listEquipment(user.id, tank.id).map((e) => ({
			id: e.id,
			name: equipmentName(e),
			type: EQUIPMENT_TYPE_LABEL[e.type],
			installed: e.installedAt ? day(e.installedAt) : null,
			serviced: e.lastServicedAt ? day(e.lastServicedAt) : null,
			serviceable: isServiced(e.type),
			flag: serviceFlag(e, today, (d) => fmtDate(d))
		})),
		targets: listParams(tank.id).map((p) => ({ name: p.name, range: p.min == null && p.max == null ? null : fmtRange(p, user) })),
		livestock: bySpecies(listLivestock(user.id, tank.id)).map((l) => ({
			id: l.id,
			name: livestockLabel(l),
			count: l.count,
			quarantine: l.status === 'quarantine'
		})),
		plants: listPlants(user.id, tank.id).map((p) => ({ id: p.id, name: p.name }))
	};
};

const back = (tankId: string) => `/tanks/${tankId}/review`;

export const actions: Actions = {
	/** ✓ Still right on one part. */
	check: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const section = str(form, 'section');
		if (!isReviewSection(section)) error(400, 'Unknown part');
		checkSection(locals.user!.id, params.id, section);
		setFlash(cookies, `✓ ${REVIEW_SECTIONS.find((s) => s.key === section)!.label} still right`);
		redirect(303, `${back(params.id)}#${section}`);
	},
	/** Serviced today, on a piece of equipment. */
	serviced: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const item = servicedToday(locals.user!.id, params.id, str(form, 'equipmentId'));
		if (!item) error(400, 'That equipment isn’t in this tank');
		setFlash(cookies, `✓ ${equipmentName(item)} serviced today`);
		redirect(303, `${back(params.id)}#equipment`);
	},
	/** All still right: finish the review. */
	finish: async ({ locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id);
		const done = finishReview(user, tank.id);
		setFlash(cookies, `✓ ${tank.name} reviewed${done.nextDue ? ` · next ${fmtDate(done.nextDue)}` : ''}`, {
			...(done.completionId ? { undo: { action: '/tasks?/undo', name: 'completionId', value: done.completionId } } : {})
		});
		redirect(303, `/tanks/${tank.id}`);
	}
};
