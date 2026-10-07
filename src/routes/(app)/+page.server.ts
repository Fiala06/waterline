import { and, count, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { redirect } from "@sveltejs/kit";
import { cyclingStage, staleAfter, type CycleTest } from "$lib/status";
import { lightingText } from "$lib/equipment";
import { displaySamples, latestSamples, sampleSeries } from "$lib/server/sensors";
import { fmtValue, paramUnit, statusOf } from "$lib/params";
import { setFlash } from "$lib/server/flash";
import {
  MIN_STREAK,
  petAnniversaries,
  streakText,
  tankMilestone,
  testMilestone,
  zeroStreak,
} from "$lib/cheers";
import { whatsNewCard } from "$lib/changelog";
import { bySpecies, livestockLabel } from "$lib/livestock";
import { eventIcon, eventKindLabel, eventTitle } from "$lib/events";
import {
  addDays,
  dateInZone,
  daysBetween,
  fmtDate,
  fmtDay,
  fmtWhen,
  todayInZone,
} from "$lib/time";
import {
  eventsSince,
  lastEventOf,
  latestReadings,
  recentActivity,
  series,
} from "$lib/server/logs";
import { tankNotes } from "$lib/server/trends";
import { db } from "$lib/server/db";
import { testReadings, tests } from "$lib/server/db/schema";
import { thumbsFor } from "$lib/server/photos";
import { equipmentName } from "$lib/equipment";
import { listEquipment, scheduledItems, listLivestock, listPlants } from "$lib/server/specs";
import { getTank, listParams, markCycling, markRunning } from "$lib/server/tanks";
import { listTasks } from "$lib/server/tasks";
import type { Actions, PageServerLoad } from "./$types";

const TREND_DAYS = 28;
/** Readings looked at for a run or a pace: a longer view than the chart's. */
/** Readings in each card's sparkline (design 1a). */
const SPARK_READINGS = 8;
/** The cycling panel's charts look back this far. */
const CYCLE_DAYS = 56;

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
    null,
  );

  // Each card's sparkline: its parameter's last readings, oldest first, all in one query
  const ranked = db
    .select({
      parameterId: testReadings.parameterId,
      value: testReadings.value,
      takenAt: tests.takenAt,
      n: sql<number>`row_number() over (partition by ${testReadings.parameterId} order by ${tests.takenAt} desc)`.as(
        "n",
      ),
    })
    .from(testReadings)
    .innerJoin(tests, eq(tests.id, testReadings.testId))
    .where(eq(tests.tankId, tank.id))
    .as("ranked");
  const sparks: Record<string, number[]> = Object.fromEntries(
    params.map((p) => [p.id, []]),
  );
  for (const r of db
    .select()
    .from(ranked)
    .where(lte(ranked.n, SPARK_READINGS))
    .orderBy(ranked.takenAt)
    .all()) {
    sparks[r.parameterId]?.push(r.value);
  }

  const since = new Date(Date.now() - TREND_DAYS * 86_400_000).toISOString();
  // the latest reading from a sensor per parameter (#19), and its line under the trend (#130)
  const live = latestSamples(tank.id);
  const trends = params.map((p) => ({
    parameterId: p.id,
    points: series(tank.id, p.id, since).map((r) => ({
      t: Date.parse(r.takenAt),
      value: r.value,
    })),
    sensor: live.has(p.id) ? displaySamples(sampleSeries(tank.id, p.id, since), p, user) : [],
  }));
  const markers = eventsSince(tank.id, ["water_change"], since).map((e) => ({
    t: Date.parse(e.occurredAt),
    label: eventTitle(e, user),
    href: `/entries/event/${e.id}`,
  }));

  const tasks = listTasks(user.id, tank.id).map((r) => r.task);
  const wcTask = tasks.find((t) => t.kind === "water_change");
  const lastWc = lastEventOf(tank.id, "water_change");

  // Spotting trends: what stands out, most urgent first, at most three
  const notes = tankNotes(tank.id, user, { limit: 3 });

  const recent = recentActivity(tank.id, 5);
  const thumbs = thumbsFor(
    recent.filter((r) => r.kind === "event").map((r) => r.id),
    recent.filter((r) => r.kind === "test").map((r) => r.id),
  );
  const activity = recent.map((item) =>
    item.kind === "test"
      ? {
          href: `/entries/test/${item.id}`,
          icon: "test" as const,
          title: `Water test · ${item.count} reading${item.count === 1 ? "" : "s"}`,
          thumb: thumbs.get(item.id) ?? null,
          sub: `${fmtWhen(item.at, tz)}${item.outOfRange ? ` · ${item.outOfRange} out of range` : ""}`,
        }
      : {
          href: `/entries/event/${item.id}`,
          icon: eventIcon(item.event),
          title: eventTitle(item.event, user),
          thumb: thumbs.get(item.id) ?? null,
          sub: `${fmtDay(item.at, tz)} · ${eventKindLabel(item.event)}`,
        },
  );

  // "In the tank": what lives in it and what runs it, each opening its tab
  const animals = bySpecies(listLivestock(user.id, tank.id));
  const inTank = animals.filter((l) => l.status === "in_tank");
  const contents = {
    // "Corydoras 4, Pepper · Corydoras": a pet by name, one animal
    livestock: inTank.map((l) =>
      l.nickname ? livestockLabel(l) : `${l.commonName} ${l.count}`,
    ),
    animals: inTank.reduce((n, l) => n + l.count, 0),
    quarantine: animals
      .filter((l) => l.status === "quarantine")
      .reduce((n, l) => n + l.count, 0),
    plants: listPlants(user.id, tank.id).map((p) => p.name),
    equipment: listEquipment(user.id, tank.id).map(equipmentName),
    // "Lights 08:00–16:00 · CO₂ 07:00–15:00"
    schedule: lightingText(tank, scheduledItems(tank.id)),
  };

  // ammonia, nitrite and nitrate by test, newest first: the zero streak, and the cycle's stage
  const cycleParams = params.filter(
    (p) => p.key === "nh3" || p.key === "no2" || p.key === "no3",
  );
  const byTest = new Map<string, CycleTest>();
  if (cycleParams.length) {
    const rows = db
      .select({
        testId: tests.id,
        parameterId: testReadings.parameterId,
        value: testReadings.value,
      })
      .from(testReadings)
      .innerJoin(tests, eq(tests.id, testReadings.testId))
      .where(
        and(
          eq(tests.tankId, tank.id),
          inArray(
            testReadings.parameterId,
            cycleParams.map((p) => p.id),
          ),
        ),
      )
      .orderBy(desc(tests.takenAt))
      .limit(600)
      .all();
    for (const r of rows) {
      const key = cycleParams.find((p) => p.id === r.parameterId)!
        .key as keyof CycleTest;
      byTest.set(r.testId, { ...byTest.get(r.testId), [key]: r.value });
    }
  }
  // a bit of fun when things are going well (the page shows it only while nothing needs attention)
  let streak: string | null = null;
  if (
    params.some((p) => p.key === "nh3") &&
    params.some((p) => p.key === "no2")
  ) {
    const n = zeroStreak([...byTest.values()]);
    if (n >= MIN_STREAK) streak = streakText(n);
  }
  // still cycling: the three readings side by side over the last 8 weeks, and where the cycle is
  const cycleSince = new Date(
    Date.now() - CYCLE_DAYS * 86_400_000,
  ).toISOString();
  // not marked cycling, but new and with ammonia or nitrite over target: ask (#68)
  const born = tank.startDate ?? tank.createdAt.slice(0, 10);
  const askCycling =
    !tank.cycling &&
    born >= addDays(today, -CYCLE_DAYS) &&
    params.some(
      (p) =>
        (p.key === "nh3" || p.key === "no2") &&
        statusOf(p, latest.get(p.id)?.value).level === "bad",
    );
  const cycling = tank.cycling
    ? {
        ...cyclingStage([...byTest.values()]),
        charts: (["nh3", "no2", "no3"] as const).map((key) => {
          const p = cycleParams.find((x) => x.key === key);
          const r = p ? latest.get(p.id) : undefined;
          return {
            key,
            id: p?.id ?? null,
            name:
              p?.name ??
              { nh3: "Ammonia", no2: "Nitrite", no3: "Nitrate" }[key],
            values: p
              ? series(tank.id, p.id, cycleSince).map((x) => x.value)
              : [],
            lo: p?.min ?? null,
            hi: p?.max ?? null,
            value: p && r ? fmtValue(p, r.value, user) : null,
            unit: p ? paramUnit(p, user) : "",
            when: r ? fmtDay(r.takenAt, tz) : null,
          };
        }),
      }
    : null;

  // readings older than their parameter's Test every cadence: how many days since
  const stale: Record<string, number> = {};
  for (const p of params) {
    const r = latest.get(p.id);
    const days = staleAfter(
      r ? dateInZone(r.takenAt, tz) : null,
      today,
      p.testEveryDays,
    );
    if (days != null) stale[p.id] = days;
  }
  const testCount =
    db.select({ n: count() }).from(tests).where(eq(tests.tankId, tank.id)).get()
      ?.n ?? 0;
  const milestones = [
    tankMilestone(tank.name, tank.startDate, today),
    ...petAnniversaries(
      inTank
        .filter((l) => l.nickname)
        .map((l) => ({ name: l.nickname!, added: l.addedAt })),
      today,
    ),
    testMilestone(testCount, latestAt ? dateInZone(latestAt, tz) : null, today),
  ].filter((m) => m != null);

  // once after an update: what's new since the version last seen, by name,
  // each with its feature's page when the line links one
  const whatsNew = whatsNewCard(user.seenVersion);

  return {
    whatsNew,
    cheers: { streak, milestones },
    contents,
    cycling,
    askCycling,
    stale,
    tank: {
      id: tank.id,
      name: tank.name,
      type: tank.type,
      nominalVolumeL: tank.nominalVolumeL,
      startDate: tank.startDate,
      cycling: tank.cycling,
    },
    params,
    latest: Object.fromEntries(latest),
    // "Live 25.4 °C · 2 min ago"
    live: Object.fromEntries(
      [...live].map(([id, s]) => {
        const p = params.find((x) => x.id === id);
        return [
          id,
          p
            ? `Live ${fmtValue(p, s.value, user)}${paramUnit(p, user) ? ` ${paramUnit(p, user)}` : ""} · ${fmtWhen(s.at, tz).replace(/^Today, /, "")}`
            : "",
        ];
      }),
    ),
    sparks,
    latestWhen: latestAt ? fmtWhen(latestAt, tz) : null,
    trends,
    trendFrom: Date.parse(since),
    notes,
    markers,
    tasks,
    today,
    waterChange: {
      // the reminder's id, so Done in Needs attention completes it (and opens the log form)
      taskId: wcTask?.id ?? null,
      days: lastWc
        ? daysBetween(dateInZone(lastWc.occurredAt, tz), today)
        : null,
      goal: wcTask?.intervalDays ?? 7,
      // "Sep 19", for "Every 7 days · last Sep 19"
      last: lastWc ? fmtDate(dateInZone(lastWc.occurredAt, tz)) : null,
    },
    activity,
  };
};

export const actions: Actions = {
  // the cycle is done: ammonia and nitrite count as failures again, with a note in History
  markCycling: async ({ request, locals, cookies }) => {
    const tankId = String((await request.formData()).get("tankId") ?? "");
    const tank = markCycling(locals.user!.id, tankId);
    setFlash(cookies, `✓ ${tank.name} is cycling`);
    redirect(303, "/");
  },
  markRunning: async ({ request, locals, cookies }) => {
    const tankId = String((await request.formData()).get("tankId") ?? "");
    const tank = markRunning(locals.user!.id, tankId);
    setFlash(cookies, `✓ ${tank.name} is running`);
    redirect(303, "/");
  },
};
