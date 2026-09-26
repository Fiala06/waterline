import { eventKindLabel, eventTitle } from '$lib/events';
import { dateInZone, daysBetween, fmtDay, fmtWhen, todayInZone } from '$lib/time';
import { eventsSince, lastEventOf, latestReadings, recentActivity, series } from '$lib/server/logs';
import { thumbsFor } from '$lib/server/photos';
import { getTank, listParams } from '$lib/server/tanks';
import { listTasks } from '$lib/server/tasks';
import type { PageServerLoad } from './$types';

const TREND_DAYS = 28;

export const load: PageServerLoad = async ({ locals, parent }) => {
	const user = locals.user!;
	const { currentTankId } = await parent();
	if (!currentTankId) return { tank: null };

	const tank = getTank(user.id, currentTankId);
	const params = listParams(tank.id);
	const latest = latestReadings(tank.id);
	const tz = user.timeZone;
	const today = todayInZone(tz);

	const latestAt = [...latest.values()].reduce<string | null>(
		(m, r) => (!m || r.takenAt > m ? r.takenAt : m),
		null
	);

	const since = new Date(Date.now() - TREND_DAYS * 86_400_000).toISOString();
	const trends = params.map((p) => ({
		parameterId: p.id,
		points: series(tank.id, p.id, since).map((r) => ({ t: Date.parse(r.takenAt), value: r.value }))
	}));
	const markers = eventsSince(tank.id, ['water_change'], since).map((e) => ({
		t: Date.parse(e.occurredAt),
		label: eventTitle(e, user),
		href: `/entries/event/${e.id}`
	}));

	const tasks = listTasks(user.id, tank.id).map((r) => r.task);
	const wcTask = tasks.find((t) => t.kind === 'water_change');
	const lastWc = lastEventOf(tank.id, 'water_change');

	const recent = recentActivity(tank.id, 5);
	const thumbs = thumbsFor(
		recent.filter((r) => r.kind === 'event').map((r) => r.id),
		recent.filter((r) => r.kind === 'test').map((r) => r.id)
	);
	const activity = recent.map((item) =>
		item.kind === 'test'
			? {
					href: `/entries/test/${item.id}`,
					icon: 'test' as const,
					title: `Water test · ${item.count} reading${item.count === 1 ? '' : 's'}`,
					thumb: thumbs.get(item.id) ?? null,
					sub: `${fmtWhen(item.at, tz)}${item.outOfRange ? ` · ${item.outOfRange} out of range` : ''}`
				}
			: {
					href: `/entries/event/${item.id}`,
					icon: item.event.category,
					title: eventTitle(item.event, user),
					thumb: thumbs.get(item.id) ?? null,
					sub: `${fmtDay(item.at, tz)} · ${eventKindLabel(item.event)}`
				}
	);

	return {
		tank: {
			id: tank.id,
			name: tank.name,
			type: tank.type,
			nominalVolumeL: tank.nominalVolumeL,
			startDate: tank.startDate
		},
		params,
		latest: Object.fromEntries(latest),
		latestWhen: latestAt ? fmtWhen(latestAt, tz) : null,
		trends,
		trendFrom: Date.parse(since),
		markers,
		tasks,
		today,
		waterChange: {
			days: lastWc ? daysBetween(dateInZone(lastWc.occurredAt, tz), today) : null,
			goal: wcTask?.intervalDays ?? 7
		},
		activity
	};
};
