import { redirect } from '@sveltejs/kit';
import { fmtValue, paramUnit, statusOf } from '$lib/params';
import { statusMedium } from '$lib/status';
import { dateInZone, fmtDate, fmtTime, fmtWhen } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { deleteTest, getTest } from '$lib/server/logs';
import { listParams } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const { test, readings } = getTest(user.id, params.id);
	const rows = listParams(test.tankId, { all: true })
		.filter((p) => readings.has(p.id))
		.map((p) => {
			const v = readings.get(p.id)!;
			const st = statusOf(p, v);
			const unit = paramUnit(p, user);
			return {
				label: p.name,
				value: `${fmtValue(p, v, user)}${unit ? ' ' + unit : ''}`,
				statusText: statusMedium(st),
				level: st.level
			};
		});
	return {
		entry: {
			id: test.id,
			tankId: test.tankId,
			title: `Water test · ${rows.length} reading${rows.length === 1 ? '' : 's'}`,
			when: fmtWhen(test.takenAt, user.timeZone),
			edited: test.editedAt ? fmtTime(test.editedAt, user.timeZone) : null,
			note: test.note,
			rows,
			day: fmtDate(dateInZone(test.takenAt, user.timeZone))
		}
	};
};

export const actions: Actions = {
	delete: ({ locals, params, cookies }) => {
		const test = deleteTest(locals.user!.id, params.id);
		setFlash(cookies, 'Entry deleted');
		redirect(303, `/?tank=${test.tankId}`);
	}
};
