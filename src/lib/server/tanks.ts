import { error } from "@sveltejs/kit";
import {
  and,
  asc,
  count,
  eq,
  isNotNull,
  isNull,
  max,
  or,
  sql,
} from "drizzle-orm";
import { defaultParameters } from "$lib/params";
import { newReviewTask } from "$lib/review";
import { addDays, todayInZone } from "$lib/time";
import { db } from "./db";
import {
  events,
  tankParameters,
  tanks,
  tasks,
  testReadings,
  tests,
  type Tank,
  type TankParameter,
  type TankType,
  type User,
} from "./db/schema";

export function listTanks(
  userId: string,
  opts: { archived?: boolean } = {},
): Tank[] {
  return db
    .select()
    .from(tanks)
    .where(
      and(
        eq(tanks.userId, userId),
        opts.archived ? isNotNull(tanks.archivedAt) : isNull(tanks.archivedAt),
      ),
    )
    .orderBy(asc(tanks.createdAt))
    .all();
}

/** A tank the user owns, or a 404. */
export function getTank(userId: string, tankId: string): Tank {
  const tank = db
    .select()
    .from(tanks)
    .where(and(eq(tanks.id, tankId), eq(tanks.userId, userId)))
    .get();
  if (!tank) error(404, "Tank not found");
  return tank;
}

export interface TankInput {
  name: string;
  type: TankType;
  nominalVolumeL: number | null;
  actualVolumeL?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  startDate?: string | null;
  notes?: string | null;
  specBrand?: string | null;
  specModel?: string | null;
  glass?: string | null;
  substrate?: string | null;
  waterSource?: string | null;
  photoperiodH?: number | null;
  /** the lighting and CO₂ schedule, "HH:MM" */
  lightsOn?: string | null;
  lightsOff?: string | null;
  co2On?: string | null;
  co2Off?: string | null;
  /** still cycling: ammonia and nitrite are stages, not failures */
  cycling?: boolean;
  /** the cover photo (null: none) and its focus, 0–100 */
  coverPhotoId?: string | null;
  coverX?: number;
  coverY?: number;
}

/**
 * Create a tank with the default parameters and a weekly water-change
 * reminder (prototype: "Default parameters and a weekly water-change reminder
 * are added.").
 */
export function createTank(user: User, input: TankInput): Tank {
  return db.transaction((tx) => {
    const tank = tx
      .insert(tanks)
      .values({ ...input, userId: user.id })
      .returning()
      .get();
    tx.insert(tankParameters)
      .values(
        defaultParameters(user, input.type).map((p) => ({
          ...p,
          tankId: tank.id,
        })),
      )
      .run();
    const today = todayInZone(user.timeZone);
    tx.insert(tasks)
      .values({
        tankId: tank.id,
        name: "Water change 25%",
        kind: "water_change",
        recurring: true,
        intervalDays: 7,
        scheduleMode: "completion",
        nextDue: addDays(today, 7),
        openFormOnDone: true,
      })
      .run();
    // the setup review (#30): every 3 months, in case something wasn't updated
    tx.insert(tasks).values(newReviewTask(tank.id, today)).run();
    tx.insert(events)
      .values({
        tankId: tank.id,
        category: "note",
        occurredAt: new Date().toISOString(),
        data: { system: "tank_created", type: input.type },
      })
      .run();
    return tank;
  });
}

export function updateTank(
  userId: string,
  tankId: string,
  patch: Partial<TankInput>,
): Tank {
  getTank(userId, tankId);
  return db
    .update(tanks)
    .set(patch)
    .where(eq(tanks.id, tankId))
    .returning()
    .get();
}

export function setArchived(userId: string, tankId: string, archived: boolean) {
  getTank(userId, tankId);
  db.transaction((tx) => {
    tx.update(tanks)
      .set({ archivedAt: archived ? new Date().toISOString() : null })
      .where(eq(tanks.id, tankId))
      .run();
    tx.insert(events)
      .values({
        tankId,
        category: "note",
        occurredAt: new Date().toISOString(),
        data: { system: archived ? "tank_archived" : "tank_restored" },
      })
      .run();
  });
}

// ── Parameters ──────────────────────────────────────────────────────────────

export function listParams(
  tankId: string,
  opts: { all?: boolean } = {},
): TankParameter[] {
  return db
    .select()
    .from(tankParameters)
    .where(
      opts.all
        ? eq(tankParameters.tankId, tankId)
        : and(
            eq(tankParameters.tankId, tankId),
            eq(tankParameters.tracked, true),
          ),
    )
    .orderBy(asc(tankParameters.sort))
    .all();
}

export function updateParams(
  userId: string,
  tankId: string,
  rows: {
    id: string;
    min: number | null;
    max: number | null;
    tracked: boolean;
    testEveryDays?: number | null;
  }[],
) {
  getTank(userId, tankId);
  db.transaction((tx) => {
    for (const r of rows) {
      tx.update(tankParameters)
        .set({
          min: r.min,
          max: r.max,
          tracked: r.tracked,
          ...(r.testEveryDays !== undefined
            ? { testEveryDays: r.testEveryDays }
            : {}),
        })
        .where(
          and(eq(tankParameters.id, r.id), eq(tankParameters.tankId, tankId)),
        )
        .run();
    }
  });
}

export function addCustomParam(
  userId: string,
  tankId: string,
  p: {
    name: string;
    unit: string;
    min: number | null;
    max: number | null;
    decimals: number;
  },
) {
  getTank(userId, tankId);
  const last = db
    .select({ s: max(tankParameters.sort) })
    .from(tankParameters)
    .where(eq(tankParameters.tankId, tankId))
    .get();
  return db
    .insert(tankParameters)
    .values({
      ...p,
      tankId,
      key: "custom",
      isCustom: true,
      tracked: true,
      sort: (last?.s ?? 0) + 1,
    })
    .returning()
    .get();
}

/**
 * Custom parameters from the keeper's other tanks that this one doesn't have
 * (by name), to add again in one tap: each once, with the tank it's from.
 */
export function reusableCustomParams(userId: string, tankId: string) {
  getTank(userId, tankId);
  const here = new Set(
    listParams(tankId, { all: true }).map((p) => p.name.trim().toLowerCase()),
  );
  const seen = new Set<string>();
  return db
    .select({ p: tankParameters, tank: tanks.name })
    .from(tankParameters)
    .innerJoin(tanks, eq(tanks.id, tankParameters.tankId))
    .where(
      and(
        eq(tanks.userId, userId),
        eq(tankParameters.isCustom, true),
        sql`${tanks.id} <> ${tankId}`,
      ),
    )
    .orderBy(asc(tanks.createdAt), asc(tankParameters.sort))
    .all()
    .filter(({ p }) => {
      const k = p.name.trim().toLowerCase();
      if (here.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(({ p, tank }) => ({
      name: p.name,
      unit: p.unit,
      min: p.min,
      max: p.max,
      decimals: p.decimals,
      tank,
    }));
}

/** Number of readings per parameter of a tank, for the "Remove" confirmation. */
export function readingCounts(tankId: string): Map<string, number> {
  const rows = db
    .select({ id: testReadings.parameterId, n: count() })
    .from(testReadings)
    .innerJoin(tankParameters, eq(tankParameters.id, testReadings.parameterId))
    .where(eq(tankParameters.tankId, tankId))
    .groupBy(testReadings.parameterId)
    .all();
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** Deletes a custom parameter with its readings, and any test left with nothing in it. */
export function deleteCustomParam(
  userId: string,
  tankId: string,
  paramId: string,
) {
  getTank(userId, tankId);
  db.transaction((tx) => {
    tx.delete(tankParameters)
      .where(
        and(
          eq(tankParameters.id, paramId),
          eq(tankParameters.tankId, tankId),
          eq(tankParameters.isCustom, true),
        ),
      )
      .run();
    tx.delete(tests)
      .where(
        and(
          eq(tests.tankId, tankId),
          or(isNull(tests.note), eq(tests.note, "")),
          sql`not exists (select 1 from test_readings r where r.test_id = ${tests.id})`,
          sql`not exists (select 1 from photos p where p.test_id = ${tests.id})`,
        ),
      )
      .run();
  });
}

/**
 * Reset to the tank type's preset: preset parameters get default targets (and
 * are added if missing); other built-ins are untracked but keep their history.
 * Custom parameters are untouched.
 */
export function resetParamDefaults(user: User, tankId: string) {
  const tank = getTank(user.id, tankId);
  const preset = defaultParameters(user, tank.type);
  const existing = new Map(
    listParams(tankId, { all: true })
      .filter((p) => !p.isCustom)
      .map((p) => [p.key, p]),
  );
  db.transaction((tx) => {
    for (const d of preset) {
      const p = existing.get(d.key);
      if (p) {
        tx.update(tankParameters)
          .set({
            name: d.name,
            min: d.min,
            max: d.max,
            tracked: true,
            decimals: d.decimals,
            sort: d.sort,
          })
          .where(eq(tankParameters.id, p.id))
          .run();
        existing.delete(d.key);
      } else {
        tx.insert(tankParameters)
          .values({ ...d, tankId })
          .run();
      }
    }
    for (const p of existing.values()) {
      tx.update(tankParameters)
        .set({ tracked: false, sort: 100 + p.sort })
        .where(eq(tankParameters.id, p.id))
        .run();
    }
  });
}

/** The tank is cycled and running: cycling off, with a "Cycle complete" note in History. */
export function markRunning(userId: string, tankId: string) {
  const tank = getTank(userId, tankId);
  if (!tank.cycling) return tank;
  return db.transaction((tx) => {
    const t = tx
      .update(tanks)
      .set({ cycling: false })
      .where(eq(tanks.id, tankId))
      .returning()
      .get();
    tx.insert(events)
      .values({
        tankId,
        category: "note",
        occurredAt: new Date().toISOString(),
        note: "Cycle complete",
        data: { system: "cycle_complete" },
      })
      .run();
    return t;
  });
}
