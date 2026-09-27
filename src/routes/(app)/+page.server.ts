import { eq, lte, sql } from 'drizzle-orm';
import { eventIcon, eventKindLabel, eventTitle } from '$lib/events';
import { dateInZone, daysBetween, fmtDay, fmtWhen, todayInZone } from '$lib/time';
import { eventsSince, lastEventOf, latestReadings, recentActivity, series } from '$lib/server/logs';
import { db } from '$lib/server/db';
import { testReadings, tests } from '$lib/server/db/schema';
import { thumbsFor } from '$lib/server/photos';
import { equipmentName } from '$lib/equipment';
import { listEquipment, listLivestock, listPlants } from '$lib/server/specs';
import { getTank, listParams } from '$lib/server/tanks';
import { listTasks } from '$lib/server/tasks';
import { trendNote } from '$lib/trends';
import type { PageServerLoad } from './$types';

const TREND_DAYS = 28;
/** Readings looked at for a run or a pace: a longer view than the chart's. */
const NOTE_DAYS = 90;
/** Readings in each card's sparkline (design 1a). */
const SPARK_READINGS = 8;

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

	// Each card's sparkline: its parameter's last readings, oldest first, all in one query
	const ranked = db
		.select({
			parameterId: testReadings.parameterId,
			value: testReadings.value,
			takenAt: tests.takenAt,
			n: sql<number>`row_number() over (partition by ${testReadings.parameterId} order by ${tests.takenAt} desc)`.as('n')
		})
		.from(testReadings)
		.innerJoin(tests, eq(tests.id, testReadings.testId))
		.where(eq(tests.tankId, tank.id))
		.as('ranked');
	const sparks: Record<string, number[]> = Object.fromEntries(params.map((p) => [p.id, []]));
	for (const r of db.select().from(ranked).where(lte(ranked.n, SPARK_READINGS)).orderBy(ranked.takenAt).all()) {
		sparks[r.parameterId]?.push(r.value);
	}

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

	// Spotting trends: what stands out, most urgent first, at most three
	const noteSince = new Date(Date.now() - NOTE_DAYS * 86_400_000).toISOString();
	const notes = params
		.flatMap((p) => {
			const points = series(tank.id, p.id, noteSince).map((r) => ({ t: Date.parse(r.takenAt), value: r.value }));
			const n = trendNote(p, points, { prefs: user, since: lastWc ? Date.parse(lastWc.occurredAt) : null });
			return n ? [n] : [];
		})
		.sort((a, b) => Number(b.warn) - Number(a.warn))
		.slice(0, 3);

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
					icon: eventIcon(item.event),
					title: eventTitle(item.event, user),
					thumb: thumbs.get(item.id) ?? null,
					sub: `${fmtDay(item.at, tz)} · ${eventKindLabel(item.event)}`
				}
	);

	// "In the tank": what lives in it and what runs it, each opening its tab
	const animals = listLivestock(user.id, tank.id);
	const inTank = animals.filter((l) => l.status === 'in_tank');
	const contents = {
		livestock: inTank.map((l) => `${l.commonName} ${l.count}`),
		animals: inTank.reduce((n, l) => n + l.count, 0),
		quarantine: animals.filter((l) => l.status === 'quarantine').reduce((n, l) => n + l.count, 0),
		plants: listPlants(user.id, tank.id).map((p) => p.name),
		equipment: listEquipment(user.id, tank.id).map(equipmentName)
	};

	return {
		contents,
		tank: {
			id: tank.id,
			name: tank.name,
			type: tank.type,
			nominalVolumeL: tank.nominalVolumeL,
			startDate: tank.startDate
		},
		params,
		latest: Object.fromEntries(latest),
		sparks,
		latestWhen: latestAt ? fmtWhen(latestAt, tz) : null,
		trends,
		trendFrom: Date.parse(since),
		notes,
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
