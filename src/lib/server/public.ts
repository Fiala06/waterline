import { coverPosition } from '$lib/media';
import { publicEntry } from '$lib/pet-names';
// Public, read-only tank pages (/t/<slug>) and photo share links (/s/<id>).
// Only what the owner switched on is included. Never public: email addresses,
// livestock sources, equipment notes, prices. Tasks, notes on entries and the
// times of tests and care only with "Detail for people helping me" on
// (public-detail.ts); otherwise the log and the timeline say the day, never the
// time, and only the latest readings say theirs.
import { error } from '@sveltejs/kit';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { EQUIPMENT_TYPE_LABEL, isWithoutType } from '$lib/equipment';
import { eventTitle } from '$lib/events';
import { fmtRange, fmtValue, paramUnit, shortName, statusOf } from '$lib/params';
import { statusShort } from '$lib/status';
import { dateInZone, fmtDate, fmtDateLong, fmtTime, fmtWhen, todayInZone } from '$lib/time';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { db } from './db';
import {
	events,
	photoLivestock,
	photos,
	photoShares,
	publicPages,
	publicPageViews,
	tanks,
	tests,
	users,
	type PublicPage,
	type Tank,
	type User
} from './db/schema';
import { getServerSettings } from './mail';
import { latestReadings, latestTest } from './logs';
import { isLive, latestSamples } from './sensors';
import { getPhoto } from './photos';
import { requireRoleOn } from './members';
import { getTank, listParams } from './tanks';
import { timelineEntries } from './timeline';
import { tankTypeLabel } from '$lib/types';

// ── Server-wide settings ────────────────────────────────────────────────────

export function publicSettings() {
	const s = getServerSettings();
	return {
		allowPublicPages: s.allowPublicPages,
		publicHomeEnabled: s.publicHomeEnabled,
		// the product homepage (#300), and who can join in the admin's own words
		landingEnabled: s.landingEnabled,
		landingAccess: s.landingAccess,
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
	const tank = getTank(userId, tankId, 'owner');
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
/** the public timeline shows this many photos at most, the latest */
const PUBLIC_TIMELINE_MAX = 24;

// Pets' names stay private unless the owner turns on "Pet names and photos":
// public titles say the species ("Betta moved into the tank"), naming one isn't
// listed, pets count with their species, and photos tagged with a pet are hidden.
const untagged = sql`not exists (select 1 from ${photoLivestock} where ${photoLivestock.photoId} = ${photos.id})`;
const monthYear = (d: string) =>
	new Date(d.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** How much of the page a visitor asked to see (?chart=); the owner's switches still decide what. */
export const CHART_RANGES = [
	{ key: '30d', days: 30, label: '30 days', title: 'the last 30 days' },
	{ key: '90d', days: 91, label: '90 days', title: 'the last 3 months' },
	{ key: '1y', days: 365, label: '1 year', title: 'the last year' },
	{ key: 'all', days: 0, label: 'All', title: 'all time' }
] as const;
export type PublicRanges = { chart: (typeof CHART_RANGES)[number]['key'] };
export function publicRanges(url: URL): PublicRanges {
	const c = url.searchParams.get('chart');
	return { chart: CHART_RANGES.some((r) => r.key === c) ? (c as PublicRanges['chart']) : '30d' };
}
/** Everything the public page may show, already filtered by the owner's switches. */
export function publicView(page: PublicPage, tank: Tank, owner: User, ranges: PublicRanges = { chart: '30d' }) {
	const tz = owner.timeZone;
	const prefs = owner;
	const today = todayInZone(tz);
	const params = listParams(tank.id);
	const latest = latestReadings(tank.id);
	// a sensor's latest sample per parameter (#19), for "● Live" on its tile and a chart of its own
	const live = page.showReadings ? latestSamples(tank.id) : new Map<string, ReturnType<typeof latestSamples> extends Map<string, infer S> ? S : never>();
	// "Live · 9:30 AM" while the sensor keeps reporting, "Last 74 °F · Yesterday, 3:11 PM" once it's gone quiet;
	// with its value where the tile shows the latest test's instead
	const liveLine = (p: (typeof params)[number], fromSensor: boolean) => {
		const s = live.get(p.id);
		if (!s) return null;
		const fresh = isLive(s.at, s.prevAt);
		const unit = paramUnit(p, prefs);
		const value = fromSensor ? '' : ` ${fmtValue(p, s.value, prefs)}${unit ? ` ${unit}` : ''}`;
		return { fresh, text: `${fresh ? 'Live' : 'Last'}${value} · ${fmtWhen(s.at, tz).replace(/^Today, /, '')}` };
	};
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
				day: dateInZone(r.takenAt, tz),
				// the reading is the sensor's (the reading of record), not a test's
				fromSensor: !!r.sensor,
				live: liveLine(p, !!r.sensor)
			};
		});
	// the latest test and when it was taken, even where a sensor's reading has replaced its on a card
	const last = cards.length ? latestTest(tank.id) : undefined;
	const lastDay = last ? dateInZone(last.takenAt, tz) : null;
	const lastAt = last?.takenAt ?? null;
	const bad = cards.filter((c) => c.level === 'bad');

	// the visitor's chart range, for the detail's charts and the download (public-detail.ts)
	const chartRange = CHART_RANGES.find((r) => r.key === ranges.chart)!;
	const since = chartRange.days ? new Date(Date.now() - chartRange.days * 86_400_000).toISOString() : '';

	const names = page.showPetNames;
	// the cover opens full size in the lightbox, captioned with its day
	const coverShot = tank.coverPhotoId
		? db.select({ takenAt: photos.takenAt, width: photos.width, height: photos.height }).from(photos).where(eq(photos.id, tank.coverPhotoId)).get()
		: null;
	// the latest photos, each with the day it was taken (dates are fine, times never); with the
	// timeline on, the photos it carries aren't shown twice: the grid keeps the others (close-ups)
	const photoIds = page.showPhotos
		? db
				.select({ id: photos.id, takenAt: photos.takenAt })
				.from(photos)
				.where(and(eq(photos.tankId, tank.id), names ? undefined : untagged, page.showTimeline ? eq(photos.inTimeline, false) : undefined))
				.orderBy(desc(photos.takenAt))
				.limit(12)
				.all()
				.map((p) => ({ id: p.id, date: fmtDateLong(dateInZone(p.takenAt, tz)) }))
		: [];

	return {
		slug: page.slug,
		name: tank.name,
		type: tank.cycling ? `${tankTypeLabel(tank.type)} · Cycling` : tankTypeLabel(tank.type),
		volume: vol,
		since: tank.startDate ? monthYear(tank.startDate) : null,
		keeper: displayNameFor(owner, page.displayName),
		description: page.showDescription ? page.description : null,
		cover: tank.coverPhotoId,
		coverPos: coverPosition(tank.coverX, tank.coverY),
		coverDate: coverShot ? fmtDateLong(dateInZone(coverShot.takenAt, tz)) : null,
		coverSize: coverShot ? { width: coverShot.width, height: coverShot.height } : null,
		// status and test date are readings too: hidden with them
		summary:
			page.showReadings && cards.length
				? { bad: bad.map((c) => `${c.name} ${c.statusLong.replace('✕ ', '').toLowerCase()}`), ok: cards.length - bad.length }
				: null,
		tested: page.showReadings && lastDay ? (lastDay === today ? 'today' : fmtDate(lastDay)) : null,
		// "7:12 PM": the time of the latest test, beside its day on the page (the share image keeps the day)
		testedTime: page.showReadings && lastAt ? fmtTime(lastAt, tz) : null,
		readings: page.showReadings ? cards : [],
		photos: photoIds,
		// what it goes without on purpose ("Heater · None"), with the equipment
		without: page.showEquipment ? tank.withoutEquipment.filter(isWithoutType).map((w) => EQUIPMENT_TYPE_LABEL[w]) : [],
		// the timeline (#26): the latest photos in date order, with the day and, when readings are on, the nearest test's
		timeline: page.showTimeline
			? timelineEntries(tank, prefs, { names, readings: page.showReadings, activity: page.showActivity, categories: PUBLIC_CATEGORIES, limit: PUBLIC_TIMELINE_MAX }).map((e) => ({
					id: e.id,
					date: e.date,
					dayNumber: e.dayNumber,
					animals: page.showLivestock ? e.animals : 0,
					plants: page.showLivestock ? e.plants : 0,
					readings: e.readings,
					gap: e.gap
				}))
			: [],
		ranges: { chart: chartRange, chartSince: since ? Date.parse(since) : null }
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

/**
 * Changes whenever the share image would look different, for ?v= cache-busting and
 * the image's cache on disk: everything the card draws (#335: edited readings,
 * targets, units, the start date and "tested today" were left out, so it went stale).
 */
export function ogVersion(page: PublicPage, tank: Tank, view: PublicView) {
	return createHash('sha1')
		.update(
			JSON.stringify([
				view.name,
				view.type,
				view.volume,
				view.since,
				view.tested,
				view.readings.map((r) => [r.key, r.name, r.value, r.unit, r.level, r.status]),
				view.summary?.bad ?? null,
				tank.coverPhotoId,
				tank.coverX,
				tank.coverY,
				page.ogPhotoId,
				page.ogPlain
			])
		)
		.digest('hex')
		.slice(0, 10);
}

/** A photo that may be shown on this public page (listed photo, cover or share image). */
export function publicPhoto(page: PublicPage, tank: Tank, photoId: string) {
	const p = db.select().from(photos).where(and(eq(photos.id, photoId), eq(photos.tankId, tank.id))).get();
	if (!p) error(404, 'Not found');
	// the cover and the share image are the owner's own picks
	const listed = (page.showPhotos || (page.showTimeline && p.inTimeline)) && (page.showPetNames || !db.select().from(photoLivestock).where(eq(photoLivestock.photoId, photoId)).get());
	const allowed = listed || photoId === tank.coverPhotoId || photoId === page.ogPhotoId;
	if (!allowed) error(404, 'Not found');
	return p;
}

export function sitemapEntries() {
	const s = publicSettings();
	if (!s.baseUrl) return [];
	// the product homepage (#300), when it's on
	const home = s.landingEnabled ? [{ loc: `${s.baseUrl}/welcome`, lastmod: undefined as string | undefined }] : [];
	if (!s.allowPublicPages) return home;
	// the last test's date is a reading: only when readings are shown, else no date at all (#343)
	return [...home, ...db
		.select({ slug: publicPages.slug, showReadings: publicPages.showReadings, updated: sql<string>`max(coalesce(${tests.takenAt}, ${tanks.createdAt}))` })
		.from(publicPages)
		.innerJoin(tanks, eq(tanks.id, publicPages.tankId))
		.leftJoin(tests, eq(tests.tankId, tanks.id))
		.where(and(eq(publicPages.enabled, true), eq(publicPages.indexable, true), isNull(tanks.archivedAt)))
		.groupBy(publicPages.slug)
		.all()
		.map((r) => ({ loc: `${s.baseUrl}/t/${r.slug}`, lastmod: r.showReadings ? r.updated?.slice(0, 10) : undefined }))];
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
	requireRoleOn(userId, getPhoto(userId, photoId).tankId, 'owner');
	const existing = getShareForPhoto(userId, photoId);
	if (existing) return existing;
	const id = randomBytes(12).toString('base64url'); // 96 bits: not guessable
	return db.insert(photoShares).values({ id, photoId }).returning().get();
}

export function updateShare(userId: string, photoId: string, patch: { includeNote: boolean; includeTank: boolean }) {
	requireRoleOn(userId, getPhoto(userId, photoId).tankId, 'owner');
	const s = getShareForPhoto(userId, photoId);
	if (!s) error(404, 'No share link');
	return db.update(photoShares).set(patch).where(eq(photoShares.id, s.id)).returning().get();
}

export function revokeShare(userId: string, photoId: string) {
	requireRoleOn(userId, getPhoto(userId, photoId).tankId, 'owner');
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
	const title = event && share.includeNote ? (event.category === 'note' ? (event.note?.split('\n')[0] ?? null) : eventTitle(publicEntry(event, false), user)) : null;
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
