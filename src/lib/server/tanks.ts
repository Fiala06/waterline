import { error } from '@sveltejs/kit';
import { and, asc, eq, isNotNull, isNull, max } from 'drizzle-orm';
import { defaultParameters } from '$lib/params';
import { addDays, todayInZone } from '$lib/time';
import { db } from './db';
import {
	events,
	tankParameters,
	tanks,
	tasks,
	type Tank,
	type TankParameter,
	type TankType,
	type User
} from './db/schema';

export function listTanks(userId: string, opts: { archived?: boolean } = {}): Tank[] {
	return db
		.select()
		.from(tanks)
		.where(
			and(
				eq(tanks.userId, userId),
				opts.archived ? isNotNull(tanks.archivedAt) : isNull(tanks.archivedAt)
			)
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
	if (!tank) error(404, 'Tank not found');
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
			.values(defaultParameters(user, input.type).map((p) => ({ ...p, tankId: tank.id })))
			.run();
		const today = todayInZone(user.timeZone);
		tx.insert(tasks)
			.values({
				tankId: tank.id,
				name: 'Water change 25%',
				kind: 'water_change',
				recurring: true,
				intervalDays: 7,
				scheduleMode: 'completion',
				nextDue: addDays(today, 7),
				openFormOnDone: true
			})
			.run();
		tx.insert(events)
			.values({
				tankId: tank.id,
				category: 'note',
				occurredAt: new Date().toISOString(),
				data: { system: 'tank_created', type: input.type }
			})
			.run();
		return tank;
	});
}

export function updateTank(userId: string, tankId: string, patch: Partial<TankInput>): Tank {
	getTank(userId, tankId);
	return db.update(tanks).set(patch).where(eq(tanks.id, tankId)).returning().get();
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
				category: 'note',
				occurredAt: new Date().toISOString(),
				data: { system: archived ? 'tank_archived' : 'tank_restored' }
			})
			.run();
	});
}

// ── Parameters ──────────────────────────────────────────────────────────────

export function listParams(tankId: string, opts: { all?: boolean } = {}): TankParameter[] {
	return db
		.select()
		.from(tankParameters)
		.where(
			opts.all
				? eq(tankParameters.tankId, tankId)
				: and(eq(tankParameters.tankId, tankId), eq(tankParameters.tracked, true))
		)
		.orderBy(asc(tankParameters.sort))
		.all();
}

export function updateParams(
	userId: string,
	tankId: string,
	rows: { id: string; min: number | null; max: number | null; tracked: boolean }[]
) {
	getTank(userId, tankId);
	db.transaction((tx) => {
		for (const r of rows) {
			tx.update(tankParameters)
				.set({ min: r.min, max: r.max, tracked: r.tracked })
				.where(and(eq(tankParameters.id, r.id), eq(tankParameters.tankId, tankId)))
				.run();
		}
	});
}

export function addCustomParam(
	userId: string,
	tankId: string,
	p: { name: string; unit: string; min: number | null; max: number | null; decimals: number }
) {
	getTank(userId, tankId);
	const last = db
		.select({ s: max(tankParameters.sort) })
		.from(tankParameters)
		.where(eq(tankParameters.tankId, tankId))
		.get();
	return db
		.insert(tankParameters)
		.values({ ...p, tankId, key: 'custom', isCustom: true, tracked: true, sort: (last?.s ?? 0) + 1 })
		.returning()
		.get();
}

export function deleteCustomParam(userId: string, tankId: string, paramId: string) {
	getTank(userId, tankId);
	db.delete(tankParameters)
		.where(
			and(
				eq(tankParameters.id, paramId),
				eq(tankParameters.tankId, tankId),
				eq(tankParameters.isCustom, true)
			)
		)
		.run();
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
			.map((p) => [p.key, p])
	);
	db.transaction((tx) => {
		for (const d of preset) {
			const p = existing.get(d.key);
			if (p) {
				tx.update(tankParameters)
					.set({ name: d.name, min: d.min, max: d.max, tracked: true, decimals: d.decimals, sort: d.sort })
					.where(eq(tankParameters.id, p.id))
					.run();
				existing.delete(d.key);
			} else {
				tx.insert(tankParameters).values({ ...d, tankId }).run();
			}
		}
		for (const p of existing.values()) {
			tx.update(tankParameters).set({ tracked: false, sort: 100 + p.sort }).where(eq(tankParameters.id, p.id)).run();
		}
	});
}
