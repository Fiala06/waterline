// What a connected AI assistant can read (#9): the same tools over MCP and the
// JSON API. All read-only, only the tanks the token was made for, in the
// keeper's units and time zone. Nothing here writes, except "last used".
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { livestockLabel } from '$lib/livestock';
import { CATEGORY_LABEL, eventTitle } from '$lib/events';
import { displayValue, fmtRange, paramDecimals, paramUnit, statusOf } from '$lib/params';
import { statusShort } from '$lib/status';
import { tankTypeLabel } from '$lib/types';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { utcToZoned } from '$lib/time';
import { db } from '../db';
import { EVENT_CATEGORIES, events, livestock, photoLivestock, photos, testReadings, tests, type EventCategory, type Tank, type User } from '../db/schema';
import { latestReadings, series } from '../logs';
import { latestSamples } from '../sensors';
import { photoFilePath } from '../photos';
import { listLivestock, listPlants } from '../specs';
import { SUMMARY_DAYS, tankSummary } from '../summary';
import { getTank, listParams } from '../tanks';
import { tankNotes } from '../trends';
import { tankTargets, tankWarnings } from '$lib/care';
import { CARE_SOURCE, careFor, speciesCareOn } from '../species-care';
import type { AssistantAccess } from './tokens';

/** A problem the assistant can fix (a wrong id, a tank it can't see): shown to it as the tool's result. */
export class ToolError extends Error {}

export type ToolResult = { kind: 'json'; data: unknown } | { kind: 'text'; text: string } | { kind: 'image'; data: Buffer; mimeType: string; caption: string };

type Args = Record<string, unknown>;

interface Tool {
	name: string;
	title: string;
	description: string;
	inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
	run: (access: AssistantAccess, args: Args) => ToolResult | Promise<ToolResult>;
}

const tankIdArg = { type: 'string', description: 'The tank, an id from list_tanks.' };
const daysArg = (fallback: number, max: number) => ({
	type: 'integer',
	minimum: 1,
	maximum: max,
	description: `How many days back, up to ${max}. ${fallback} if left out.`
});

/** A whole number of days in range, or the fallback. */
function days(args: Args, fallback: number, max: number) {
	const n = Number(args.days ?? fallback);
	return Number.isFinite(n) ? Math.min(max, Math.max(1, Math.round(n))) : fallback;
}

/** A tank this token may read. */
function tankFor(access: AssistantAccess, args: Args): Tank {
	const id = typeof args.tank_id === 'string' ? args.tank_id : '';
	if (!id) throw new ToolError('Give a tank_id: call list_tanks for them.');
	if (!access.tankIds.has(id)) throw new ToolError(`No tank ${id} is shared with this assistant. Call list_tanks for the ones that are.`);
	return getTank(access.user.id, id);
}

const local = (instant: string, user: User) => {
	const z = utcToZoned(instant, user.timeZone);
	return `${z.date} ${z.time}`;
};
const sinceDays = (n: number, now = Date.now()) => new Date(now - n * 86_400_000).toISOString();

function tankFacts(t: Tank, user: User) {
	const vol = (l: number | null) => (l == null ? null : `${formatNumber(toDisplay(l, 'volume', user), 1)} ${unitLabel('volume', user)}`);
	return {
		id: t.id,
		name: t.name,
		type: tankTypeLabel(t.type),
		volume: vol(t.nominalVolumeL),
		water_volume: vol(t.actualVolumeL),
		set_up: t.startDate,
		archived: !!t.archivedAt
	};
}

// ── The tools ───────────────────────────────────────────────────────────────

const listTanksTool: Tool = {
	name: 'list_tanks',
	title: 'List tanks',
	description: "The keeper's aquariums shared with you, with each one's id, type, volume and when it was last tested. Start here.",
	inputSchema: { type: 'object', properties: {} },
	run: ({ user, tankIds }) => {
		const tanks = [...tankIds].map((id) => getTank(user.id, id));
		return {
			kind: 'json',
			data: {
				units: {
					temperature: unitLabel('temp', user),
					volume: unitLabel('volume', user),
					length: unitLabel('length', user),
					hardness: user.hardnessUnit === 'ppm' ? 'ppm' : 'dGH and dKH'
				},
				time_zone: user.timeZone,
				tanks: tanks.map((t) => {
					const last = db.select({ takenAt: tests.takenAt }).from(tests).where(eq(tests.tankId, t.id)).orderBy(desc(tests.takenAt)).get();
					return { ...tankFacts(t, user), last_tested: last ? local(last.takenAt, user) : null };
				})
			}
		};
	}
};

const summaryTool: Tool = {
	name: 'get_tank_summary',
	title: 'Tank summary',
	description:
		"One tank's whole picture as Markdown: its setup, each parameter against its target with recent readings, trends, water tests, the care log, livestock, plants, equipment and the maintenance schedule. The best first read before answering a question about a tank.",
	inputSchema: {
		type: 'object',
		properties: { tank_id: tankIdArg, days: { type: 'integer', enum: [30, 90, 365], description: 'The period covered: 30, 90 or 365 days. 90 if left out.' } },
		required: ['tank_id']
	},
	run: (access, args) => {
		const t = tankFor(access, args);
		const d = (SUMMARY_DAYS as readonly number[]).includes(Number(args.days)) ? Number(args.days) : 90;
		return { kind: 'text', text: tankSummary(access.user, t.id, d) };
	}
};

const readingsTool: Tool = {
	name: 'get_readings',
	title: 'Water test readings',
	description:
		"Water test readings for a tank, per parameter, oldest first, in the keeper's units: each parameter's target range, latest reading and its status (✓ OK, ▲ Near, ✕ High or Low, – No data), and the newest reading from a sensor or controller when the tank has one.",
	inputSchema: {
		type: 'object',
		properties: {
			tank_id: tankIdArg,
			parameter: { type: 'string', description: 'Only this parameter, by name or key, e.g. "Nitrate", "no3", "pH". All if left out.' },
			days: daysArg(90, 3650)
		},
		required: ['tank_id']
	},
	run: (access, args) => {
		const { user } = access;
		const t = tankFor(access, args);
		const n = days(args, 90, 3650);
		const want = typeof args.parameter === 'string' ? args.parameter.trim().toLowerCase() : '';
		const all = listParams(t.id);
		const params = want ? all.filter((p) => p.name.toLowerCase() === want || p.key === want) : all;
		if (want && !params.length) throw new ToolError(`${t.name} doesn't track "${args.parameter}". It tracks: ${all.map((p) => p.name).join(', ')}.`);
		const latest = latestReadings(t.id);
		const live = latestSamples(t.id);
		const since = sinceDays(n);
		const shown = (p: (typeof all)[number], v: number) => Number(displayValue(p, v, user).toFixed(Math.max(paramDecimals(p, user), 2)));
		return {
			kind: 'json',
			data: {
				tank: t.name,
				days: n,
				parameters: params.map((p) => {
					const l = latest.get(p.id);
					return {
						name: p.name,
						key: p.key,
						unit: paramUnit(p, user),
						target: fmtRange(p, user) || null,
						latest: l ? { at: local(l.takenAt, user), value: shown(p, l.value), status: statusShort(statusOf(p, l.value)) } : null,
						// the newest reading from a sensor or controller (#19), apart from the hand-logged tests
						sensor: live.has(p.id) ? { at: local(live.get(p.id)!.at, user), value: shown(p, live.get(p.id)!.value), source: live.get(p.id)!.source } : null,
						readings: series(t.id, p.id, since).map((r) => ({ at: local(r.takenAt, user), value: shown(p, r.value) }))
					};
				})
			}
		};
	}
};

const historyTool: Tool = {
	name: 'get_history',
	title: 'History',
	description:
		"A tank's History, newest first: water tests, water changes, dosing, maintenance, livestock and equipment changes, observations and notes, each with its note and the ids of its photos (for get_photo).",
	inputSchema: {
		type: 'object',
		properties: {
			tank_id: tankIdArg,
			days: daysArg(30, 3650),
			category: { type: 'string', enum: ['water_test', ...EVENT_CATEGORIES], description: 'Only this kind of entry. All if left out.' },
			limit: { type: 'integer', minimum: 1, maximum: 200, description: 'At most this many entries, 50 if left out.' }
		},
		required: ['tank_id']
	},
	run: (access, args) => {
		const { user } = access;
		const t = tankFor(access, args);
		const since = sinceDays(days(args, 30, 3650));
		const limit = Math.min(200, Math.max(1, Math.round(Number(args.limit) || 50)));
		const cat = typeof args.category === 'string' ? args.category : '';
		if (cat && cat !== 'water_test' && !(EVENT_CATEGORIES as readonly string[]).includes(cat)) throw new ToolError(`No category "${cat}".`);

		const evs =
			cat === 'water_test'
				? []
				: db
						.select()
						.from(events)
						.where(and(eq(events.tankId, t.id), gte(events.occurredAt, since), ...(cat ? [eq(events.category, cat as EventCategory)] : [])))
						.orderBy(desc(events.occurredAt))
						.limit(limit)
						.all();
		const tst =
			cat && cat !== 'water_test'
				? []
				: db
						.select()
						.from(tests)
						.where(and(eq(tests.tankId, t.id), gte(tests.takenAt, since)))
						.orderBy(desc(tests.takenAt))
						.limit(limit)
						.all();
		const all = listParams(t.id, { all: true });
		const params = new Map(all.map((p) => [p.id, p]));
		// a test's readings in the tank's order, as the app lists them
		const order = new Map(all.map((p, i) => [p.id, i]));
		const readings = tst.length ? db.select().from(testReadings).where(inArray(testReadings.testId, tst.map((x) => x.id))).all() : [];
		const photoRows =
			evs.length || tst.length
				? db
						.select({ id: photos.id, eventId: photos.eventId, testId: photos.testId })
						.from(photos)
						.where(and(eq(photos.tankId, t.id), gte(photos.takenAt, since)))
						.all()
				: [];
		const photosOf = (key: 'eventId' | 'testId', id: string) => photoRows.filter((p) => p[key] === id).map((p) => p.id);

		const entries = [
			...evs.map((e) => ({
				sort: e.occurredAt,
				at: local(e.occurredAt, user),
				category: e.category,
				kind: CATEGORY_LABEL[e.category],
				title: eventTitle(e, user),
				// a note's title is its note
				note: e.note && e.note !== eventTitle(e, user) ? e.note : null,
				photo_ids: photosOf('eventId', e.id)
			})),
			...tst.map((x) => ({
				sort: x.takenAt,
				at: local(x.takenAt, user),
				category: 'water_test',
				kind: 'Water test',
				title: readings
					.filter((r) => r.testId === x.id && params.has(r.parameterId))
					.sort((a, b) => order.get(a.parameterId)! - order.get(b.parameterId)!)
					.map((r) => {
						const p = params.get(r.parameterId)!;
						const unit = paramUnit(p, user);
						return `${p.name} ${formatNumber(displayValue(p, r.value, user), paramDecimals(p, user))}${unit ? ` ${unit}` : ''}`;
					})
					.join(', '),
				note: x.note,
				photo_ids: photosOf('testId', x.id)
			}))
		]
			.sort((a, b) => b.sort.localeCompare(a.sort))
			.slice(0, limit)
			.map(({ sort: _, ...e }) => e);
		return { kind: 'json', data: { tank: t.name, entries } };
	}
};

const livestockTool: Tool = {
	name: 'get_livestock',
	title: 'Livestock and plants',
	description: "What lives in a tank: fish, invertebrates and corals (with how many, pets by name, quarantine, when added and where from), and plants. Past livestock too if asked.",
	inputSchema: {
		type: 'object',
		properties: { tank_id: tankIdArg, include_removed: { type: 'boolean', description: 'Also livestock that has left the tank. False if left out.' } },
		required: ['tank_id']
	},
	run: (access, args) => {
		const { user } = access;
		const t = tankFor(access, args);
		const care = (l: ReturnType<typeof listLivestock>[number]) => {
			const c = careFor(l.scientificName);
			return c ? { care: { ...c, units: 'temperature °C, hardness dGH, length cm', source: `${CARE_SOURCE.name}, ${CARE_SOURCE.license}` } } : {};
		};
		const animal = (l: ReturnType<typeof listLivestock>[number]) => ({
			name: livestockLabel(l),
			...care(l),
			common_name: l.commonName,
			scientific_name: l.scientificName,
			pet_name: l.nickname,
			kind: l.kind,
			count: l.count,
			in_quarantine: l.status === 'quarantine',
			added: l.addedAt,
			source: l.source,
			notes: l.notes,
			...(l.removedAt ? { removed: l.removedAt.slice(0, 10) } : {})
		});
		return {
			kind: 'json',
			data: {
				tank: t.name,
				livestock: listLivestock(user.id, t.id).map(animal),
				// care (#20): targets against ranges, group sizes and well-known conflicts
				worth_checking: speciesCareOn()
					? tankWarnings(
							listLivestock(user.id, t.id).map((l) => ({ s: l.scientificName, name: l.commonName, count: l.count })),
							careFor,
							tankTargets(listParams(t.id)),
							user
						).map((w) => w.replace(/^▲ /, ''))
					: [],
				...(args.include_removed === true ? { removed_livestock: listLivestock(user.id, t.id, { removed: true }).map(animal) } : {}),
				plants: listPlants(user.id, t.id).map((p) => ({
					name: p.name,
					scientific_name: p.scientificName,
					position: p.position,
					status: p.status,
					last_trimmed: p.lastTrimmedAt ? local(p.lastTrimmedAt, user).slice(0, 10) : null
				}))
			}
		};
	}
};

const trendsTool: Tool = {
	name: 'get_trends',
	title: 'Trends',
	description:
		"What Waterline noticed in a tank's last 90 days of readings, most urgent first: readings rising or falling test after test, heading past a target, drifting between water changes, or changing after a dose.",
	inputSchema: { type: 'object', properties: { tank_id: tankIdArg }, required: ['tank_id'] },
	run: (access, args) => {
		const t = tankFor(access, args);
		const names = new Map(listParams(t.id).map((p) => [p.id, p.name]));
		return {
			kind: 'json',
			data: {
				tank: t.name,
				trends: tankNotes(t.id, access.user).map((n) => ({ parameter: names.get(n.parameterId) ?? null, kind: n.kind, heading_past_target: n.warn, text: n.text }))
			}
		};
	}
};

const listPhotosTool: Tool = {
	name: 'list_photos',
	title: 'List photos',
	description: "A tank's photos, newest first: when each was taken, the entry it's on and the pets in it. Look at one with get_photo.",
	inputSchema: {
		type: 'object',
		properties: { tank_id: tankIdArg, limit: { type: 'integer', minimum: 1, maximum: 100, description: 'At most this many, 20 if left out.' } },
		required: ['tank_id']
	},
	run: (access, args) => {
		const { user } = access;
		const t = tankFor(access, args);
		const limit = Math.min(100, Math.max(1, Math.round(Number(args.limit) || 20)));
		const rows = db
			.select({ photo: photos, event: events, test: tests })
			.from(photos)
			.leftJoin(events, eq(events.id, photos.eventId))
			.leftJoin(tests, eq(tests.id, photos.testId))
			.where(eq(photos.tankId, t.id))
			.orderBy(desc(photos.takenAt), desc(photos.id))
			.limit(limit)
			.all();
		const ids = rows.map((r) => r.photo.id);
		const pets = ids.length
			? db
					.select({ photoId: photoLivestock.photoId, animal: livestock })
					.from(photoLivestock)
					.innerJoin(livestock, eq(livestock.id, photoLivestock.livestockId))
					.where(inArray(photoLivestock.photoId, ids))
					.all()
			: [];
		return {
			kind: 'json',
			data: {
				tank: t.name,
				photos: rows.map(({ photo, event, test }) => ({
					id: photo.id,
					taken: local(photo.takenAt, user),
					width: photo.width,
					height: photo.height,
					entry: event ? eventTitle(event, user) : test ? 'Water test' : null,
					note: event?.note ?? test?.note ?? null,
					pets: pets.filter((p) => p.photoId === photo.id).map((p) => livestockLabel(p.animal)),
					cover: t.coverPhotoId === photo.id
				}))
			}
		};
	}
};

/** Long edge for "large": about what vision models read at full detail. */
const LARGE = 1568;

const photoTool: Tool = {
	name: 'get_photo',
	title: 'Look at a photo',
	description: 'One photo, as an image to look at: small (a square thumbnail) or large (up to 1568 px).',
	inputSchema: {
		type: 'object',
		properties: {
			photo_id: { type: 'string', description: 'A photo id from list_photos or get_history.' },
			size: { type: 'string', enum: ['small', 'large'], description: 'large if left out.' }
		},
		required: ['photo_id']
	},
	run: async (access, args) => {
		const { photo, tankName } = photoFor(access, typeof args.photo_id === 'string' ? args.photo_id : '');
		const data = await photoImage(photo, args.size === 'small' ? 'small' : 'large');
		return { kind: 'image', data, mimeType: 'image/jpeg', caption: `Photo from ${tankName}, taken ${local(photo.takenAt, access.user)}.` };
	}
};

/** A photo on a tank this token may read. */
export function photoFor(access: AssistantAccess, id: string) {
	const row = id ? db.select().from(photos).where(eq(photos.id, id)).get() : undefined;
	if (!row || !access.tankIds.has(row.tankId)) throw new ToolError(`No photo ${id || '(none given)'} is shared with this assistant.`);
	return { photo: row, tankName: getTank(access.user.id, row.tankId).name };
}

export async function photoImage(photo: typeof photos.$inferSelect, size: 'small' | 'large') {
	try {
		if (size === 'small') return await readFile(photoFilePath(photo, 'thumb'));
		const full = await readFile(photoFilePath(photo, 'full'));
		if (Math.max(photo.width, photo.height) <= LARGE) return full;
		return await sharp(full).resize(LARGE, LARGE, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
	} catch {
		throw new ToolError("That photo's file is missing on the server.");
	}
}

export const TOOLS: Tool[] = [listTanksTool, summaryTool, readingsTool, historyTool, livestockTool, trendsTool, listPhotosTool, photoTool];

export async function runTool(access: AssistantAccess, name: string, args: Args): Promise<ToolResult> {
	const tool = TOOLS.find((t) => t.name === name);
	if (!tool) throw new ToolError(`No tool "${name}".`);
	return tool.run(access, args ?? {});
}
