import { coverPosition } from '$lib/media';
import { redirect } from '@sveltejs/kit';
import { shortName, statusOf } from '$lib/params';
import { dueInfo } from '$lib/tasks';
import { dateInZone, daysBetween, fmtDay, fmtMonthYear, todayInZone } from '$lib/time';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { setFlash } from '$lib/server/flash';
import { lastEventAtFor, latestReadingsFor, latestTestAtFor } from '$lib/server/logs';
import { getTank, listParamsFor, listTanks, setArchived } from '$lib/server/tanks';
import { leaveTank, ownerNames, rolesOn } from '$lib/server/members';
import { revokeActionTokens } from '$lib/server/action-tokens';
import { logger } from '$lib/server/log';
import { listTasks } from '$lib/server/tasks';
import { photoSizes } from '$lib/server/photos';
import type { Actions, PageServerLoad } from './$types';

const relDay = (d: string) => (d === 'Today' || d === 'Yesterday' ? d.toLowerCase() : d);
/** "Jun 2026" for a 'YYYY-MM-DD' date (D3: "archived Jun 2026"). */
const monthYear = fmtMonthYear;

export const load: PageServerLoad = ({ locals }) => {
	const user = locals.user!;
	const tz = user.timeZone;
	const today = todayInZone(tz);
	const tasks = listTasks(user.id).map((r) => r.task);
	const vol = (l: number | null) =>
		l == null ? null : `${formatNumber(toDisplay(l, 'volume', user), 1)} ${unitLabel('volume', user)}`;

	// each tank's readings, targets, last test, last water change and role, a query each for all of them (#353)
	const list = listTanks(user.id);
	const ids = list.map((t) => t.id);
	const latestOf = latestReadingsFor(ids);
	const paramsOf = listParamsFor(ids);
	const testAt = latestTestAtFor(ids);
	const wcAt = lastEventAtFor(ids, 'water_change');
	const roles = rolesOn(user.id, list);
	const owners = ownerNames(list.filter((t) => t.userId !== user.id).map((t) => t.userId));
	const tanks = list.map((t) => {
		const latest = latestOf.get(t.id) ?? new Map();
		const params = paramsOf.get(t.id) ?? [];
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

		const mine = tasks.filter((k) => k.tankId === t.id).map((k) => dueInfo(k.due, today, k.graceDays));
		const overdue = mine.filter((d) => d.section === 'overdue').length;
		const dueToday = mine.filter((d) => d.days === 0).length;
		const task = overdue
			? { level: 'bad', text: `✕ ${overdue} task${overdue === 1 ? '' : 's'} overdue` }
			: dueToday
				? { level: 'warn', text: `▲ ${dueToday} due today` }
				: null;

		const lt = testAt.get(t.id);
		const wc = wcAt.get(t.id);
		const wcDays = wc ? daysBetween(dateInZone(wc, tz), today) : null;
		const meta = [
			lt ? `Last test ${relDay(fmtDay(lt, tz))}` : 'No tests yet',
			wcDays == null ? null : `last water change ${wcDays === 0 ? 'today' : `${wcDays} day${wcDays === 1 ? '' : 's'} ago`}`
		]
			.filter(Boolean)
			.join(' · ');

		// shared with this person (#22): "Shared by Cory · can log"
		const role = roles.get(t.id) ?? 'view';
		const sharer = role === 'owner' ? null : (owners.get(t.userId) ?? 'someone');
		const shared = sharer && `Shared by ${sharer} · ${role === 'log' ? 'can log' : 'can view'}`;
		return { id: t.id, name: t.name, type: t.type, cover: t.coverPhotoId, coverPos: coverPosition(t.coverX, t.coverY), volume: vol(t.nominalVolumeL), status, task, meta: shared ? `${shared} · ${meta}` : meta, sharer };
	});

	const archived = listTanks(user.id, { archived: true }).map((t) => ({
		id: t.id,
		name: t.name,
		type: t.type,
		cover: t.coverPhotoId,
		coverPos: coverPosition(t.coverX, t.coverY),
		volume: vol(t.nominalVolumeL),
		archivedOn: t.archivedAt ? monthYear(dateInZone(t.archivedAt, tz)) : '',
		owner: t.userId === user.id
	}));

	// each cover's own shape, so the cards don't move as their photos load (#243)
	const sizes = photoSizes([...tanks, ...archived].map((t) => t.cover));
	const sized = <T extends { cover: string | null }>(t: T) => ({ ...t, coverSize: t.cover ? (sizes.get(t.cover) ?? null) : null });
	return { tankCards: tanks.map(sized), archived: archived.map(sized) };
};

export const actions: Actions = {
	restore: async ({ request, locals, cookies }) => {
		const id = String((await request.formData()).get('tankId') ?? '');
		const tank = getTank(locals.user!.id, id);
		setArchived(locals.user!.id, id, false);
		setFlash(cookies, `✓ ${tank.name} restored`);
		redirect(303, '/tanks');
	},
	/** A tank someone shared with you (#218): leave it, and its reminders stop. */
	leave: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const id = String((await request.formData()).get('tankId') ?? '');
		const tank = getTank(user.id, id);
		if (leaveTank(tank.id, user.id)) {
			// the Mark done and Snooze links from reminders they were sent stop working too (#216)
			revokeActionTokens(user.id, tank.id);
			logger.info('settings', `${user.email} left ${tank.name}`, { userId: user.id, tankId: tank.id });
			setFlash(cookies, `✓ You left ${tank.name}`);
		}
		redirect(303, '/tanks');
	}
};
