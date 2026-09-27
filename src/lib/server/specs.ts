// Equipment, livestock and plants for a tank. Every change also writes an
// event, so History shows what was added, removed, counted or trimmed.
import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { equipmentName, type EquipmentType } from '$lib/equipment';
import { zonedToUtc } from '$lib/time';
import { db } from './db';
import { equipment, events, livestock, photoLivestock, photos, plants, tanks, tasks, type Equipment, type Livestock, type Plant } from './db/schema';
import { getTank } from './tanks';

const now = () => new Date().toISOString();

/** When the change happened and what the History entry says, from the log form. */
export interface EntryMeta {
	at?: string;
	note?: string | null;
	/** the offline queue's id, so a replayed form isn't applied twice */
	clientId?: string | null;
	/** made by an import, undone with it */
	importId?: string | null;
}

function logEvent(tankId: string, category: 'livestock' | 'equipment' | 'maintenance', data: Record<string, unknown>, meta: EntryMeta = {}) {
	return db
		.insert(events)
		.values({
			tankId,
			category,
			occurredAt: meta.at ?? now(),
			note: meta.note ?? null,
			data,
			clientId: meta.clientId ?? null,
			importId: meta.importId ?? null
		})
		.returning()
		.get();
}

// ── Equipment ───────────────────────────────────────────────────────────────

export function listEquipment(userId: string, tankId: string, opts: { removed?: boolean } = {}) {
	getTank(userId, tankId);
	return db
		.select()
		.from(equipment)
		.where(and(eq(equipment.tankId, tankId), opts.removed ? isNotNull(equipment.removedAt) : isNull(equipment.removedAt)))
		.orderBy(asc(equipment.createdAt))
		.all();
}

export function getEquipment(userId: string, id: string): Equipment {
	const row = db
		.select({ e: equipment })
		.from(equipment)
		.innerJoin(tanks, eq(tanks.id, equipment.tankId))
		.where(and(eq(equipment.id, id), eq(tanks.userId, userId)))
		.get();
	if (!row) error(404, 'Equipment not found');
	return row.e;
}

export interface EquipmentInput {
	type: EquipmentType;
	brand: string | null;
	model: string | null;
	specs: Record<string, unknown>;
	installedAt: string | null;
	notes: string | null;
}

export function addEquipment(userId: string, tankId: string, input: EquipmentInput, timeZone: string, importId: string | null = null) {
	getTank(userId, tankId);
	const e = db.insert(equipment).values({ ...input, tankId, importId }).returning().get();
	// an install date without a time goes on that day at noon, in the user's zone
	const at = input.installedAt ? zonedToUtc(input.installedAt, '12:00', timeZone).toISOString() : now();
	logEvent(tankId, 'equipment', { action: 'installed', equipment_id: e.id, item: equipmentName(e) }, { at, importId });
	return e;
}

export function updateEquipment(userId: string, id: string, input: EquipmentInput) {
	const before = getEquipment(userId, id);
	const after = db.update(equipment).set(input).where(eq(equipment.id, id)).returning().get();
	// Record what changed so charts can mark it ("8 h → 7 h").
	const changes: Record<string, [unknown, unknown]> = {};
	for (const k of new Set([...Object.keys(before.specs), ...Object.keys(after.specs)])) {
		if (before.specs[k] !== after.specs[k]) changes[k] = [before.specs[k] ?? null, after.specs[k] ?? null];
	}
	if (before.brand !== after.brand || before.model !== after.model || Object.keys(changes).length) {
		logEvent(after.tankId, 'equipment', { action: 'adjusted', equipment_id: id, item: equipmentName(after), changes });
	}
	return after;
}

/** Moves it to past equipment. Its suggested maintenance reminder goes with it. */
export function removeEquipment(userId: string, id: string, meta: EntryMeta & { reasons?: string[] } = {}) {
	const e = getEquipment(userId, id);
	db.update(equipment).set({ removedAt: meta.at ?? now() }).where(eq(equipment.id, id)).run();
	const tasksRemoved = db.delete(tasks).where(eq(tasks.equipmentId, id)).run().changes;
	const event = logEvent(e.tankId, 'equipment', { action: 'removed', equipment_id: id, item: equipmentName(e), reasons: meta.reasons ?? [] }, meta);
	return Object.assign(e, { event, tasksRemoved });
}

export function markServiced(userId: string, id: string, at: string) {
	getEquipment(userId, id);
	db.update(equipment).set({ lastServicedAt: at }).where(eq(equipment.id, id)).run();
}

/** Brands the user has on other tanks, for "Tidewell · used in Reef 24". */
export function knownBrands(userId: string) {
	return db
		.select({ brand: equipment.brand, tankName: tanks.name })
		.from(equipment)
		.innerJoin(tanks, eq(tanks.id, equipment.tankId))
		.where(and(eq(tanks.userId, userId), isNotNull(equipment.brand), ne(equipment.brand, '')))
		.all()
		.filter((r, i, all) => all.findIndex((x) => x.brand!.toLowerCase() === r.brand!.toLowerCase()) === i)
		.map((r) => ({ brand: r.brand!, tankName: r.tankName }));
}

// ── Livestock ───────────────────────────────────────────────────────────────

export function listLivestock(userId: string, tankId: string, opts: { removed?: boolean } = {}) {
	getTank(userId, tankId);
	return db
		.select()
		.from(livestock)
		.where(and(eq(livestock.tankId, tankId), opts.removed ? isNotNull(livestock.removedAt) : isNull(livestock.removedAt)))
		.orderBy(asc(livestock.createdAt))
		.all();
}

export function getLivestock(userId: string, id: string): Livestock {
	const row = db
		.select({ l: livestock })
		.from(livestock)
		.innerJoin(tanks, eq(tanks.id, livestock.tankId))
		.where(and(eq(livestock.id, id), eq(tanks.userId, userId)))
		.get();
	if (!row) error(404, 'Livestock not found');
	return row.l;
}

export interface LivestockInput {
	kind: Livestock['kind'];
	commonName: string;
	scientificName: string | null;
	count: number;
	status: Livestock['status'];
	addedAt: string | null;
	source: string | null;
}

/** A current group (not a named pet) of the same species with this status, other than `except`. */
function sameSpecies(tankId: string, l: Pick<Livestock, 'status' | 'scientificName' | 'commonName'>, except?: string) {
	return db
		.select()
		.from(livestock)
		.where(
			and(
				eq(livestock.tankId, tankId),
				isNull(livestock.removedAt),
				isNull(livestock.nickname),
				eq(livestock.status, l.status),
				except ? ne(livestock.id, except) : undefined,
				l.scientificName
					? eq(livestock.scientificName, l.scientificName)
					: sql`lower(${livestock.commonName}) = ${l.commonName.toLowerCase()}`
			)
		)
		.get();
}

/** Add animals; the same species with the same status adds to the existing count. */
export function addLivestock(userId: string, tankId: string, input: LivestockInput, meta: EntryMeta = {}) {
	getTank(userId, tankId);
	const same = sameSpecies(tankId, input);
	const row = same
		? db.update(livestock).set({ count: same.count + input.count }).where(eq(livestock.id, same.id)).returning().get()
		: db.insert(livestock).values({ ...input, tankId, importId: meta.importId ?? null }).returning().get();
	const event = logEvent(tankId, 'livestock', {
		action: 'added',
		livestock_id: row.id,
		name: row.commonName,
		scientific_name: row.scientificName,
		count: input.count,
		status: input.status,
		delta: input.count
	}, meta);
	return { row, event };
}

export type CountReason = 'loss' | 'rehomed' | 'recount' | 'added';

/** Change a count (T4). Decreases need a reason; reaching 0 moves it to past livestock. */
export function changeCount(userId: string, id: string, newCount: number, reason: CountReason, meta: EntryMeta = {}) {
	const at = meta.at ?? now();
	const l = getLivestock(userId, id);
	const delta = newCount - l.count;
	if (delta === 0) return Object.assign(l, { event: null as typeof events.$inferSelect | null });
	db.update(livestock)
		.set({ count: Math.max(0, newCount), removedAt: newCount <= 0 ? at : null })
		.where(eq(livestock.id, id))
		.run();
	const event = logEvent(l.tankId, 'livestock', {
		action: reason === 'recount' ? 'recount' : delta > 0 ? 'added' : 'removed',
		reason: delta > 0 && reason !== 'recount' ? null : reason,
		livestock_id: id,
		name: l.commonName,
		nickname: l.nickname,
		count: Math.abs(delta),
		delta,
		from: l.count,
		to: newCount
	}, { ...meta, at });
	return Object.assign(getLivestock(userId, id), { event });
}

/** Quarantine ↔ in tank. Moving in joins an existing group of the same species; a named pet stays its own. */
export function setLivestockStatus(userId: string, id: string, status: Livestock['status']) {
	const l = getLivestock(userId, id);
	if (l.status === status) return l;
	const same = l.nickname ? undefined : sameSpecies(l.tankId, { ...l, status }, l.id);
	if (same) {
		db.update(livestock).set({ count: same.count + l.count }).where(eq(livestock.id, same.id)).run();
		db.delete(livestock).where(eq(livestock.id, id)).run();
	} else {
		db.update(livestock).set({ status }).where(eq(livestock.id, id)).run();
	}
	logEvent(l.tankId, 'livestock', { action: 'status', livestock_id: same?.id ?? id, name: l.commonName, nickname: l.nickname, count: l.count, status });
	return l;
}

/**
 * Name an animal, or rename or unname a pet. In a group, naming one takes it
 * out into its own entry ("Corydoras ×6" becomes "×5" and "Pepper"), so each
 * pet has its own photo, notes and history. Returns the pet's entry.
 */
export function nameLivestock(userId: string, id: string, nickname: string | null, meta: EntryMeta = {}) {
	const l = getLivestock(userId, id);
	if (l.removedAt) error(400, "Livestock that has left the tank can't be renamed");
	nickname = nickname?.trim().slice(0, 60) || null;
	if (nickname === l.nickname) return l;
	if (!nickname && !l.nickname) return l;
	let pet = l;
	if (nickname && !l.nickname && l.count > 1) {
		db.update(livestock).set({ count: l.count - 1 }).where(eq(livestock.id, l.id)).run();
		pet = db
			.insert(livestock)
			.values({
				tankId: l.tankId,
				kind: l.kind,
				commonName: l.commonName,
				scientificName: l.scientificName,
				count: 1,
				status: l.status,
				addedAt: l.addedAt,
				source: l.source,
				nickname
			})
			.returning()
			.get();
	} else {
		pet = db.update(livestock).set({ nickname }).where(eq(livestock.id, l.id)).returning().get();
	}
	logEvent(l.tankId, 'livestock', {
		action: 'named',
		livestock_id: pet.id,
		...(pet.id !== l.id ? { from_id: l.id } : {}),
		name: l.commonName,
		nickname,
		previous: l.nickname
	}, meta);
	return pet;
}

/** Notes and the profile photo: about the pet, not a change to the tank, so no History entry. A profile photo is also tagged. */
export function updateLivestockDetails(userId: string, id: string, patch: Partial<Pick<Livestock, 'notes' | 'photoId'>>) {
	getLivestock(userId, id);
	if (patch.photoId) tagPhoto(userId, patch.photoId, id, true);
	return db.update(livestock).set(patch).where(eq(livestock.id, id)).returning().get();
}

// ── Pets in photos ──────────────────────────────────────────────────────────

/** Tag (or untag) a pet in one of its tank's photos. */
export function tagPhoto(userId: string, photoId: string, livestockId: string, on: boolean) {
	const l = getLivestock(userId, livestockId);
	const photo = db.select().from(photos).where(eq(photos.id, photoId)).get();
	if (!photo || photo.tankId !== l.tankId) error(404, 'Photo not found');
	if (on) db.insert(photoLivestock).values({ photoId, livestockId }).onConflictDoNothing().run();
	else db.delete(photoLivestock).where(and(eq(photoLivestock.photoId, photoId), eq(photoLivestock.livestockId, livestockId))).run();
}

/** The pets tagged in a photo (ids). */
export function photoPets(photoId: string): string[] {
	return db.select({ id: photoLivestock.livestockId }).from(photoLivestock).where(eq(photoLivestock.photoId, photoId)).all().map((r) => r.id);
}

/** A pet's photos, newest first. */
export function petPhotos(userId: string, livestockId: string) {
	getLivestock(userId, livestockId);
	return db
		.select({ id: photos.id, takenAt: photos.takenAt })
		.from(photoLivestock)
		.innerJoin(photos, eq(photos.id, photoLivestock.photoId))
		.where(eq(photoLivestock.livestockId, livestockId))
		.orderBy(desc(photos.takenAt))
		.all();
}

// ── Plants ──────────────────────────────────────────────────────────────────

export function listPlants(userId: string, tankId: string) {
	getTank(userId, tankId);
	return db.select().from(plants).where(and(eq(plants.tankId, tankId), isNull(plants.removedAt))).orderBy(asc(plants.createdAt)).all();
}

export function getPlant(userId: string, id: string): Plant {
	const row = db
		.select({ p: plants })
		.from(plants)
		.innerJoin(tanks, eq(tanks.id, plants.tankId))
		.where(and(eq(plants.id, id), eq(tanks.userId, userId)))
		.get();
	if (!row) error(404, 'Plant not found');
	return row.p;
}

export function addPlant(userId: string, tankId: string, input: Pick<Plant, 'name' | 'scientificName' | 'position' | 'status'>, meta: EntryMeta = {}) {
	getTank(userId, tankId);
	const p = db.insert(plants).values({ ...input, tankId, importId: meta.importId ?? null }).returning().get();
	const event = logEvent(tankId, 'livestock', { action: 'added', plant_id: p.id, name: p.name, scientific_name: p.scientificName, kind: 'plant' }, meta);
	return Object.assign(p, { event });
}

export function updatePlant(userId: string, id: string, patch: Partial<Pick<Plant, 'position' | 'status'>>) {
	getPlant(userId, id);
	return db.update(plants).set(patch).where(eq(plants.id, id)).returning().get();
}

export function removePlant(userId: string, id: string, meta: EntryMeta = {}) {
	const p = getPlant(userId, id);
	db.update(plants).set({ removedAt: meta.at ?? now() }).where(eq(plants.id, id)).run();
	const event = logEvent(p.tankId, 'livestock', { action: 'removed', plant_id: id, name: p.name, kind: 'plant' }, meta);
	return Object.assign(p, { event });
}

/** "Log trim": one maintenance entry, and the trimmed plants remember the date. */
export function logTrim(userId: string, tankId: string, plantIds: string[], note: string | null) {
	const mine = listPlants(userId, tankId).filter((p) => plantIds.includes(p.id));
	if (!mine.length) error(400, 'Choose at least one plant');
	const at = now();
	for (const p of mine) db.update(plants).set({ lastTrimmedAt: at }).where(eq(plants.id, p.id)).run();
	return logEvent(tankId, 'maintenance', { actions: ['Trimmed plants'], plants: mine.map((p) => p.name) }, { note, at });
}
