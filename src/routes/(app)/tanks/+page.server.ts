import { redirect } from '@sveltejs/kit';
import { shortName, statusOf } from '$lib/params';
import { dueInfo } from '$lib/tasks';
import { dateInZone, daysBetween, fmtDateLong, fmtDay, todayInZone } from '$lib/time';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { setFlash } from '$lib/server/flash';
import { lastEventOf, latestReadings, latestTest } from '$lib/server/logs';
import { getTank, listParams, listTanks, setArchived } from '$lib/server/tanks';
import { listTasks } from '$lib/server/tasks';
import type { Actions, PageServerLoad } from './$types';

const relDay = (d: string) => (d === 'Today' || d === 'Yesterday' ? d.toLowerCase() : d);

export const load: PageServerLoad = ({ locals }) => {
	const user = locals.user!;
	const tz = user.timeZone;
	const today = todayInZone(tz);
	const tasks = listTasks(user.id).map((r) => r.task);
	const vol = (l: number | null) =>
		l == null ? null : `${formatNumber(toDisplay(l, 'volume', user), 0)} ${unitLabel('volume', user)}`;

	const tanks = listTanks(user.id).map((t) => {
		const latest = latestReadings(t.id);
		const params = listParams(t.id);
		const bad = params
			.map((p) => ({ p, st: statusOf(p, latest.get(p.id)?.value) }))
			.filter((x) => x.st.level === 'bad');
		const tested = params.some((p) => latest.has(p.id));
		const status = !tested
			? { level: 'none', text: '– No readings yet' }
			: bad.length
				? {
						level: 'bad',
						text: `✕ ${bad.length === 1 ? `${shortName(bad[0].p)} ${bad[0].st.direction === 'low' ? 'low' : 'high'}` : `${bad.length} out of range`}`
					}
				: { level: 'ok', text: '✓ All in range' };

		const mine = tasks.filter((k) => k.tankId === t.id).map((k) => dueInfo(k.due, today));
		const overdue = mine.filter((d) => d.days < 0).length;
		const dueToday = mine.filter((d) => d.days === 0).length;
		const task = overdue
			? { level: 'bad', text: `✕ ${overdue} task${overdue === 1 ? '' : 's'} overdue` }
			: dueToday
				? { level: 'warn', text: `▲ ${dueToday} due today` }
				: null;

		const lt = latestTest(t.id);
		const wc = lastEventOf(t.id, 'water_change');
		const wcDays = wc ? daysBetween(dateInZone(wc.occurredAt, tz), today) : null;
		const meta = [
			lt ? `Last test ${relDay(fmtDay(lt.takenAt, tz))}` : 'No tests yet',
			wcDays == null ? null : `last water change ${wcDays === 0 ? 'today' : `${wcDays} day${wcDays === 1 ? '' : 's'} ago`}`
		]
			.filter(Boolean)
			.join(' · ');

		return { id: t.id, name: t.name, type: t.type, cover: t.coverPhotoId, volume: vol(t.nominalVolumeL), status, task, meta };
	});

	const archived = listTanks(user.id, { archived: true }).map((t) => ({
		id: t.id,
		name: t.name,
		type: t.type,
		volume: vol(t.nominalVolumeL),
		archivedOn: t.archivedAt ? fmtDateLong(dateInZone(t.archivedAt, tz)) : ''
	}));

	return { tankCards: tanks, archived };
};

export const actions: Actions = {
	restore: async ({ request, locals, cookies }) => {
		const id = String((await request.formData()).get('tankId') ?? '');
		const tank = getTank(locals.user!.id, id);
		setArchived(locals.user!.id, id, false);
		setFlash(cookies, `✓ ${tank.name} restored`);
		redirect(303, '/tanks');
	}
};
