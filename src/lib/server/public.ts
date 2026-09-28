// Public, read-only tank pages (/t/<slug>) and photo share links (/s/<id>).
// Only what the owner switched on is included. Never public: tasks, notes on
// entries, exact times, email addresses, livestock sources, equipment notes.
import { error } from '@sveltejs/kit';
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { equipmentName, specSummary } from '$lib/equipment';
import { eventTitle } from '$lib/events';
import { bySpecies, livestockLabel, speciesKey } from '$lib/livestock';
import { displayValue, fmtRange, fmtValue, paramDecimals, paramUnit, shortName, statusOf } from '$lib/params';
import { statusShort } from '$lib/status';
import { dateInZone, fmtDate, todayInZone } from '$lib/time';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { db } from './db';
import {
	equipment,
	events,
	livestock,
	photoLivestock,
	photos,
	photoShares,
	plants,
	publicPages,
	publicPageViews,
	tanks,
	tests,
	testReadings,
	users,
	type PublicPage,
	type Tank,
	type User
} from './db/schema';
import { getServerSettings } from './mail';
import { latestReadings, series } from './logs';
import { getPhoto } from './photos';
import { getTank, listParams } from './tanks';
import { tankTypeLabel } from '$lib/types';

// ── Server-wide settings ────────────────────────────────────────────────────

export function publicSettings() {
	const s = getServerSettings();
	return {
		allowPublicPages: s.allowPublicPages,
		publicHomeEnabled: s.publicHomeEnabled,
		baseUrl: (s.publicBaseUrl || env.ORIGIN || '').replace(/\/+$/, '') || null,
		ga4Id: s.ga4Id,
		consentBanner: s.consentBanner,
		searchConsoleTag: s.searchConsoleTag
	};
}

// ── Owner side ──────────────────────────────────────────────────────────────

const RESERVED = new Set(['new', 'admin', 'api', 'settings', 'edit', 'public', 'login', 'signin']);
export const slugify = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/\p{M}/gu, '') // accents
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);

export function validSlug(slug: string) {
	return /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/.test(slug) && !RESERVED.has(slug);
}

function slugTaken(slug: string, tankId: string) {
	const row = db.select().from(publicPages).where(eq(publicPages.slug, slug)).get();
	return !!row && row.tankId !== tankId;
}

/** The tank's public page settings, creating defaults (off) the first time. */
export function getPublicPage(userId: string, tankId: string): PublicPage {
	const tank = getTank(userId, tankId);
	const existing = db.select().from(publicPages).where(eq(publicPages.tankId, tankId)).get();
	if (existing) return existing;
	let base = slugify(tank.name) || 'tank'; // e.g. a name in another script
	if (base.length < 3) base = `${base}-tank`;
	let slug = base;
	for (let i = 2; slugTaken(slug, tankId) || RESERVED.has(slug); i++) slug = `${base.slice(0, 55)}-${i}`;
	return db.insert(publicPages).values({ tankId, slug }).returning().get();
}

export type PublicPatch = Partial<Omit<PublicPage, 'tankId' | 'viewCount'>>;

export function updatePublicPage(userId: string, tankId: string, patch: PublicPatch): { error: string } | { page: PublicPage } {
	getPublicPage(userId, tankId);
	if (patch.slug !== undefined) {
		if (!validSlug(patch.slug)) return { error: 'Use 3–60 lowercase letters, numbers and dashes.' };
		if (slugTaken(patch.slug, tankId)) return { error: 'That link is taken. Try another.' };
	}
	return { page: db.update(publicPages).set(patch).where(eq(publicPages.tankId, tankId)).returning().get() };
}

export function viewsThisWeek(tankId: string) {
	const since = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10); // today and the 6 days before
	return (
		db
			.select({ n: sql<number>`coalesce(sum(${publicPageViews.views}), 0)` })
			.from(publicPageViews)
			.where(and(eq(publicPageViews.tankId, tankId), gte(publicPageViews.day, since)))
			.get()?.n ?? 0
	);
}

// ── Public side ─────────────────────────────────────────────────────────────

/** A live public page by slug, or a 404. */
export function findPublic(slug: string) {
	if (!publicSettings().allowPublicPages) error(404, 'Not found');
	const row = db
		.select({ page: publicPages, tank: tanks, user: users })
		.from(publicPages)
		.innerJoin(tanks, eq(tanks.id, publicPages.tankId))
		.innerJoin(users, eq(users.id, tanks.userId))
		.where(and(eq(publicPages.slug, slug), eq(publicPages.enabled, true), isNull(tanks.archivedAt)))
		.get();
	if (!row) error(404, 'Not found');
	return row;
}

export function displayNameFor(user: User, mode: PublicPage['displayName']) {
	if (mode === 'none') return null;
	const name = user.displayName.trim();
	if (mode === 'full') return name || null;
	const [first, ...rest] = name.split(/\s+/);
	return rest.length ? `${first} ${rest.at(-1)!.charAt(0)}.` : first || null;
}

const PUBLIC_CATEGORIES = ['water_change', 'dosing', 'maintenance', 'livestock', 'equipment'] as const;

// Pets' names stay private unless the owner turns on "Pet names and photos":
// public titles say the species ("Betta moved into the tank"), naming one isn't
// listed, pets count with their species, and photos tagged with a pet are hidden.
const withoutPetNames = <E extends { data: Record<string, unknown> }>(e: E): E => ({ ...e, data: { ...e.data, nickname: null, previous: null } });
const untagged = sql`not exists (select 1 from ${photoLivestock} where ${photoLivestock.photoId} = ${photos.id})`;
const isNaming = (e: { category: string; data: Record<string, unknown> }) => e.category === 'livestock' && e.data.action === 'named';
/** Pets count with their species, never by name. */
function perSpecies(rows: { id: string; commonName: string; scientificName: string | null; count: number }[]) {
	const groups = new Map<string, { id: string; name: string; count: number | null }>();
	for (const l of rows) {
		const g = groups.get(speciesKey(l));
		if (g) g.count = (g.count ?? 0) + l.count;
		else groups.set(speciesKey(l), { id: l.id, name: l.commonName, count: l.count });
	}
	return [...groups.values()];
}
const monthYear = (d: string) =>
	new Date(d.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Everything the public page may show, already filtered by the owner's switches. */
export function publicView(page: PublicPage, tank: Tank, owner: User) {
	const tz = owner.timeZone;
	const prefs = owner;
	const today = todayInZone(tz);
	const params = listParams(tank.id);
	const latest = latestReadings(tank.id);
	const vol = tank.nominalVolumeL != null ? `${formatNumber(toDisplay(tank.nominalVolumeL, 'volume', prefs), 1)} ${unitLabel('volume', prefs)}` : null;

	const cards = params
		.filter((p) => latest.has(p.id))
		.map((p) => {
			const r = latest.get(p.id)!;
			const st = statusOf(p, r.value);
			return {
				id: p.id,
				key: p.key,
				name: shortName(p),
				value: fmtValue(p, r.value, prefs),
				unit: paramUnit(p, prefs),
				level: st.level,
				status: statusShort(st).replace(/ (low|high)$/, ''),
				statusLong: statusShort(st),
				target: fmtRange(p, prefs, false),
				day: dateInZone(r.takenAt, tz)
			};
		});
	const lastDay = cards.reduce<string | null>((m, c) => (!m || c.day > m ? c.day : m), null);
	const bad = cards.filter((c) => c.level === 'bad');

	// Charts: up to three parameters, bad ones first; dates only (no times).
	const since = new Date(Date.now() - 91 * 86_400_000).toISOString();
	// Problems first, then the usual headline parameters.
	const ORDER = ['no3', 'ph', 'kh', 'temp', 'gh', 'nh3', 'no2'];
	const rank = (p: (typeof params)[number]) => {
		const l = statusOf(p, latest.get(p.id)?.value).level;
		const o = ORDER.indexOf(p.key);
		return (l === 'bad' ? 0 : l === 'warn' ? 100 : 200) + (o < 0 ? 50 : o);
	};
	const chartParams = [...params]
		.filter((p) => latest.has(p.id))
		.sort((a, b) => rank(a) - rank(b))
		.slice(0, 3);
	const charts = page.showCharts
		? chartParams
				.map((p) => ({
					id: p.id,
					name: p.name,
					unit: paramUnit(p, prefs),
					decimals: paramDecimals(p, prefs),
					target: fmtRange(p, prefs),
					band: {
						min: p.min == null ? null : displayValue(p, p.min, prefs),
						max: p.max == null ? null : displayValue(p, p.max, prefs)
					},
					// public charts are by day: the day's last reading stands for it
					points: [
						...new Map(
							series(tank.id, p.id, since).map((r) => {
								const t = Date.parse(dateInZone(r.takenAt, tz) + 'T12:00:00Z');
								return [t, { t, v: displayValue(p, r.value, prefs) }];
							})
						).values()
					],
					lastLevel: statusOf(p, latest.get(p.id)?.value).level
				}))
				.filter((c) => c.points.length >= 2)
		: [];

	const names = page.showPetNames;
	const photoIds = page.showPhotos
		? db
				.select({ id: photos.id })
				.from(photos)
				.where(and(eq(photos.tankId, tank.id), names ? undefined : untagged))
				.orderBy(desc(photos.takenAt))
				.limit(12)
				.all()
				.map((p) => p.id)
		: [];

	// quarantined animals aren't in the display tank yet
	const animals = page.showLivestock
		? db
				.select()
				.from(livestock)
				.where(and(eq(livestock.tankId, tank.id), isNull(livestock.removedAt), eq(livestock.status, 'in_tank')))
				.all()
		: [];
	const plantNames = page.showLivestock
		? db.select().from(plants).where(and(eq(plants.tankId, tank.id), isNull(plants.removedAt))).all().map((p) => p.name)
		: [];
	const gear = page.showEquipment
		? db
				.select()
				.from(equipment)
				.where(and(eq(equipment.tankId, tank.id), isNull(equipment.removedAt)))
				.all()
				.map((e) => ({ id: e.id, name: equipmentName(e), spec: specSummary(e.type, e.specs, prefs)[0] ?? null }))
		: [];

	let activity: { key: string; title: string; kind: string; day: string }[] = [];
	if (page.showActivity) {
		const ev = db
			.select()
			.from(events)
			.where(and(eq(events.tankId, tank.id), inArray(events.category, [...PUBLIC_CATEGORIES])))
			.orderBy(desc(events.occurredAt))
			.limit(16)
			.all()
			.filter((e) => names || !isNaming(e))
			.slice(0, 8)
			.map((e) => ({ key: `e:${e.id}`, at: e.occurredAt, title: eventTitle(names ? e : withoutPetNames(e), prefs), kind: e.category }));
		const ts = db
			.select({ id: tests.id, at: tests.takenAt, n: sql<number>`count(${testReadings.parameterId})` })
			.from(tests)
			.leftJoin(testReadings, eq(testReadings.testId, tests.id))
			.where(eq(tests.tankId, tank.id))
			.groupBy(tests.id)
			.orderBy(desc(tests.takenAt))
			.limit(8)
			.all()
			.map((t) => ({ key: `t:${t.id}`, at: t.at, title: `Water test · ${t.n} reading${t.n === 1 ? '' : 's'}`, kind: 'test' }));
		activity = [...ev, ...ts]
			.sort((a, b) => b.at.localeCompare(a.at))
			.slice(0, 8)
			.map(({ key, at, title, kind }) => {
				const d = dateInZone(at, tz);
				return { key, title, kind, day: d === today ? 'Today' : fmtDate(d) };
			});
	}

	return {
		slug: page.slug,
		name: tank.name,
		type: tankTypeLabel(tank.type),
		volume: vol,
		since: tank.startDate ? monthYear(tank.startDate) : null,
		keeper: displayNameFor(owner, page.displayName),
		description: page.showDescription ? page.description : null,
		cover: tank.coverPhotoId,
		// status and test date are readings too: hidden with them
		summary:
			page.showReadings && cards.length
				? { bad: bad.map((c) => `${c.name} ${c.statusLong.replace('✕ ', '').toLowerCase()}`), ok: cards.length - bad.length }
				: null,
		tested: page.showReadings && lastDay ? (lastDay === today ? 'today' : fmtDate(lastDay)) : null,
		readings: page.showReadings ? cards : [],
		charts,
		photos: photoIds,
		// with names: each group, then its pets by name (one animal, no count)
		livestock: names
			? bySpecies(animals).map((l) => ({ id: l.id, name: livestockLabel(l), count: l.nickname ? null : l.count }))
			: perSpecies(animals),
		plants: plantNames,
		equipment: gear,
		activity
	};
}

export type PublicView = ReturnType<typeof publicView>;

/** Count a view (crawlers and link previewers are skipped). */
export function recordView(tankId: string, userAgent: string | null) {
	if (!userAgent || /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|discord|telegram/i.test(userAgent)) return;
	const day = new Date().toISOString().slice(0, 10);
	db.insert(publicPageViews)
		.values({ tankId, day, views: 1 })
		.onConflictDoUpdate({ target: [publicPageViews.tankId, publicPageViews.day], set: { views: sql`${publicPageViews.views} + 1` } })
		.run();
	db.update(publicPages).set({ viewCount: sql`${publicPages.viewCount} + 1` }).where(eq(publicPages.tankId, tankId)).run();
}

/** Changes whenever the share image would look different, for ?v= cache-busting. */
export function ogVersion(page: PublicPage, tank: Tank) {
	const last = db.select({ id: tests.id, at: tests.takenAt }).from(tests).where(eq(tests.tankId, tank.id)).orderBy(desc(tests.takenAt)).get();
	return createHash('sha1')
		.update([tank.name, tank.type, tank.nominalVolumeL, tank.coverPhotoId, page.ogPhotoId, page.ogPlain, page.showReadings, last?.id, last?.at].join('|'))
		.digest('hex')
		.slice(0, 10);
}

/** A photo that may be shown on this public page (listed photo, cover or share image). */
export function publicPhoto(page: PublicPage, tank: Tank, photoId: string) {
	const p = db.select().from(photos).where(and(eq(photos.id, photoId), eq(photos.tankId, tank.id))).get();
	if (!p) error(404, 'Not found');
	// the cover and the share image are the owner's own picks
	const listed = page.showPhotos && (page.showPetNames || !db.select().from(photoLivestock).where(eq(photoLivestock.photoId, photoId)).get());
	const allowed = listed || photoId === tank.coverPhotoId || photoId === page.ogPhotoId;
	if (!allowed) error(404, 'Not found');
	return p;
}

export function sitemapEntries() {
	const s = publicSettings();
	if (!s.allowPublicPages || !s.baseUrl) return [];
	return db
		.select({ slug: publicPages.slug, updated: sql<string>`max(coalesce(${tests.takenAt}, ${tanks.createdAt}))` })
		.from(publicPages)
		.innerJoin(tanks, eq(tanks.id, publicPages.tankId))
		.leftJoin(tests, eq(tests.tankId, tanks.id))
		.where(and(eq(publicPages.enabled, true), eq(publicPages.indexable, true), isNull(tanks.archivedAt)))
		.groupBy(publicPages.slug)
		.all()
		.map((r) => ({ loc: `${s.baseUrl}/t/${r.slug}`, lastmod: r.updated?.slice(0, 10) }));
}

export function publicTanksForHome() {
	return db
		.select({ page: publicPages, tank: tanks, user: users })
		.from(publicPages)
		.innerJoin(tanks, eq(tanks.id, publicPages.tankId))
		.innerJoin(users, eq(users.id, tanks.userId))
		.where(and(eq(publicPages.enabled, true), eq(publicPages.indexable, true), isNull(tanks.archivedAt)))
		.all();
}

// ── Photo share links ───────────────────────────────────────────────────────

export function getShareForPhoto(userId: string, photoId: string) {
	getPhoto(userId, photoId);
	return db.select().from(photoShares).where(and(eq(photoShares.photoId, photoId), isNull(photoShares.revokedAt))).get() ?? null;
}

export function createShare(userId: string, photoId: string) {
	const existing = getShareForPhoto(userId, photoId);
	if (existing) return existing;
	const id = randomBytes(12).toString('base64url'); // 96 bits: not guessable
	return db.insert(photoShares).values({ id, photoId }).returning().get();
}

export function updateShare(userId: string, photoId: string, patch: { includeNote: boolean; includeTank: boolean }) {
	const s = getShareForPhoto(userId, photoId);
	if (!s) error(404, 'No share link');
	return db.update(photoShares).set(patch).where(eq(photoShares.id, s.id)).returning().get();
}

export function revokeShare(userId: string, photoId: string) {
	const s = getShareForPhoto(userId, photoId);
	if (s) db.update(photoShares).set({ revokedAt: new Date().toISOString() }).where(eq(photoShares.id, s.id)).run();
}

/** A live share by id, with what it may show. */
export function findShare(id: string) {
	if (!publicSettings().allowPublicPages) error(404, 'Not found');
	const row = db
		.select({ share: photoShares, photo: photos, tank: tanks, user: users, event: events })
		.from(photoShares)
		.innerJoin(photos, eq(photos.id, photoShares.photoId))
		.innerJoin(tanks, eq(tanks.id, photos.tankId))
		.innerJoin(users, eq(users.id, tanks.userId))
		.leftJoin(events, eq(events.id, photos.eventId))
		.where(and(eq(photoShares.id, id), isNull(photoShares.revokedAt), isNull(tanks.archivedAt)))
		.get();
	if (!row) error(404, 'Not found');
	const { share, photo, tank, user, event } = row;
	const day = dateInZone(photo.takenAt, user.timeZone);
	const title = event && share.includeNote ? (event.category === 'note' ? (event.note?.split('\n')[0] ?? null) : eventTitle(withoutPetNames(event), user)) : null;
	return {
		id: share.id,
		photoId: photo.id,
		width: photo.width,
		height: photo.height,
		title,
		note: share.includeNote && event && event.category !== 'note' ? event.note : null,
		date: share.includeNote
			? new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
			: null,
		tankName: share.includeTank ? tank.name : null,
		tankSlug: share.includeTank
			? (db.select().from(publicPages).where(and(eq(publicPages.tankId, tank.id), eq(publicPages.enabled, true))).get()?.slug ?? null)
			: null
	};
}
