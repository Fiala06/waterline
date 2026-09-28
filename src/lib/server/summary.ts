// "Summary for an AI assistant": one tank as Markdown to paste into a chat
// assistant with a question. Written to be read, in the keeper's units and
// time zone, and without account details. Waterline sends it nowhere.
import { EQUIPMENT_TYPE_LABEL, equipmentName, specSummary } from '$lib/equipment';
import { bySpecies, speciesCount } from '$lib/livestock';
import { eventKindLabel, eventTitle } from '$lib/events';
import { fmtRange, fmtValue, paramUnit, statusOf } from '$lib/params';
import { dueInfo, effectiveDue, intervalText } from '$lib/tasks';
import { addDays, daysBetween, fmtDateLong, todayInZone, utcToZoned, zonedToUtc } from '$lib/time';
import { tankTypeLabel } from '$lib/types';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { EVENT_CATEGORIES, type User } from './db/schema';
import { tankNotes } from './trends';
import { eventsSince, latestReadings, testsSince } from './logs';
import { listEquipment, listLivestock, listPlants } from './specs';
import { getTank, listParams } from './tanks';
import { listTasks } from './tasks';

export const SUMMARY_DAYS = [30, 90, 365] as const;
/** ?days=30, 90 or 365; 90 otherwise. */
export const summaryDays = (url: URL) => {
	const d = Number(url.searchParams.get('days'));
	return (SUMMARY_DAYS as readonly number[]).includes(d) ? d : 90;
};
const MAX_TESTS = 60;
const SOURCES: Record<string, string> = { tap: 'Tap', rodi: 'RODI', mix: 'Mix', well: 'Well' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** A table cell: one line, no column breaks. */
const cell = (s: string) => s.replace(/\s*\n\s*/g, ' / ').replace(/\|/g, '\\|');
const table = (head: string[], rows: string[][]) => [
	`| ${head.map(cell).join(' | ')} |`,
	`| ${head.map(() => '---').join(' | ')} |`,
	...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)
];

/** "1 year, 6 months" from a start date to today. */
function age(start: string, today: string) {
	const [y1, m1, d1] = start.split('-').map(Number);
	const [y2, m2, d2] = today.split('-').map(Number);
	const months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
	if (months < 1) return plural(Math.max(0, daysBetween(start, today)), 'day');
	const y = Math.floor(months / 12);
	const m = months % 12;
	return [y && plural(y, 'year'), m && plural(m, 'month')].filter(Boolean).join(', ');
}

/** The tank as Markdown, covering the last `days` days. */
export function tankSummary(user: User, tankId: string, days: number, now = new Date()): string {
	const t = getTank(user.id, tankId);
	const tz = user.timeZone;
	const today = todayInZone(tz, now);
	const since = zonedToUtc(addDays(today, -days), '00:00', tz).toISOString();
	const period = days === 365 ? 'the last year' : `the last ${days} days`;
	const at = (instant: string) => {
		const z = utcToZoned(instant, tz);
		return `${z.date} ${z.time}`;
	};
	const day = (instant: string) => utcToZoned(instant, tz).date;
	const vol = (l: number) => `${formatNumber(toDisplay(l, 'volume', user), 1)} ${unitLabel('volume', user)}`;
	const len = (cm: number) => formatNumber(toDisplay(cm, 'length', user), 0);

	const out: string[] = [];
	const section = (title: string, lines: string[]) => out.push('', `## ${title}`, '', ...lines);

	out.push(
		`# ${t.name}: aquarium summary from Waterline`,
		'',
		`My aquarium's record from Waterline, an aquarium log, for context. Written ${fmtDateLong(today)}, covering ${period}. ` +
			`Units: ${unitLabel('temp', user)}, ${unitLabel('volume', user)}${user.unitSystem === 'imperial' ? ' (US)' : ''}, ${unitLabel('length', user)}; ` +
			`hardness in ${user.hardnessUnit === 'ppm' ? 'ppm' : 'dGH and dKH'}. Times are ${tz}.`
	);

	// ── The tank ────────────────────────────────────────────────────────────
	const volume = t.nominalVolumeL != null ? vol(t.nominalVolumeL) : null;
	const facts: [string, string | null][] = [
		['Type', tankTypeLabel(t.type)],
		['Volume', volume && t.actualVolumeL != null ? `${volume} (${vol(t.actualVolumeL)} of water)` : volume],
		['Size', t.lengthCm && t.widthCm && t.heightCm ? `${len(t.lengthCm)} × ${len(t.widthCm)} × ${len(t.heightCm)} ${unitLabel('length', user)}` : null],
		['Set up', t.startDate ? `${fmtDateLong(t.startDate)} (${age(t.startDate, today)} ago)` : null],
		['Tank', [t.specBrand, t.specModel].filter(Boolean).join(' ') || null],
		['Substrate', t.substrate],
		['Water source', t.waterSource ? (SOURCES[t.waterSource] ?? t.waterSource) : null],
		['Light', t.photoperiodH != null ? `${formatNumber(t.photoperiodH, 1)} h a day` : null],
		['Archived', t.archivedAt ? fmtDateLong(day(t.archivedAt)) : null],
		['Notes', t.notes]
	];
	section(
		'Tank',
		facts.filter(([, v]) => v).map(([k, v]) => `- ${k}: ${cell(v!)}`)
	);

	// ── Parameters: target, latest, recent ──────────────────────────────────
	const params = listParams(t.id);
	const latest = latestReadings(t.id);
	const all = testsSince(t.id, since);
	const tests = all.slice(-MAX_TESTS);
	const shown = (p: (typeof params)[number], v: number) => `${fmtValue(p, v, user)}${paramUnit(p, user) ? ` ${paramUnit(p, user)}` : ''}`;
	section(
		'Water parameters',
		params.length
			? table(
					['Parameter', 'Target', 'Latest', 'Status', `Readings in ${period}, oldest first`],
					params.map((p) => {
						const l = latest.get(p.id);
						const s = statusOf(p, l?.value);
						const word =
							s.level === 'ok'
								? 'OK'
								: s.level === 'warn'
									? `Near the ${s.direction === 'high' ? 'high' : 'low'} limit`
									: s.level === 'bad'
										? s.direction === 'high'
											? 'High, above target'
											: 'Low, below target'
										: 'No readings';
						const recent = all.flatMap((x) => (x.readings.has(p.id) ? [fmtValue(p, x.readings.get(p.id)!, user)] : [])).slice(-8);
						return [
							p.name,
							fmtRange(p, user) || 'none set',
							l ? `${shown(p, l.value)} on ${day(l.takenAt)}` : '–',
							word,
							recent.join(', ') || '–'
						];
					})
				)
			: ['No parameters are tracked.']
	);

	// ── Trends: runs, paces and patterns, as on the dashboard ──────────────
	const noticed = tankNotes(t.id, user).map((n) => `- ${n.text}`);
	if (noticed.length) section('Trends', noticed);

	// ── Water tests ─────────────────────────────────────────────────────────
	const used = params.filter((p) => tests.some((x) => x.readings.has(p.id)));
	const notes = tests.some((x) => x.test.note);
	section(
		`Water tests in ${period}${all.length > tests.length ? ` (the ${MAX_TESTS} most recent of ${all.length})` : all.length ? ` (${all.length})` : ''}, oldest first`,
		tests.length
			? table(
					['When', ...used.map((p) => (paramUnit(p, user) ? `${p.name} (${paramUnit(p, user)})` : p.name)), ...(notes ? ['Note'] : [])],
					tests.map((x) => [
						at(x.test.takenAt),
						...used.map((p) => (x.readings.has(p.id) ? fmtValue(p, x.readings.get(p.id)!, user) : '')),
						...(notes ? [x.test.note ?? ''] : [])
					])
				)
			: [`No water tests in ${period}.`]
	);

	// ── Care log ────────────────────────────────────────────────────────────
	const events = eventsSince(t.id, [...EVENT_CATEGORIES], since);
	section(
		`Care log in ${period}, oldest first`,
		events.length
			? events.map((e) => {
					const title = eventTitle(e, user);
					const kind = eventKindLabel(e);
					const note = e.note?.trim();
					// "Water change · 50% · RODI" says what it is; "+5 Otocinclus" needs "Livestock change"
					const what = title.toLowerCase().startsWith(kind.toLowerCase()) ? title : `${kind} · ${title}`;
					return `- ${at(e.occurredAt)} · ${what}${note && note !== title ? ` · note: "${cell(note)}"` : ''}`;
				})
			: [`Nothing logged in ${period}.`]
	);

	// ── What's in the tank ──────────────────────────────────────────────────
	const animals = bySpecies(listLivestock(user.id, t.id));
	section(
		animals.length ? `Livestock (${plural(animals.reduce((n, l) => n + l.count, 0), 'animal')}, ${plural(speciesCount(animals), 'species', 'species')})` : 'Livestock',
		animals.length
			? animals.map(
					(l) =>
						// a pet: "- Captain, a Betta (Betta splendens), fish"
						`- ${l.nickname ? `${cell(l.nickname)}, a` : `${l.count} ×`} ${l.commonName}${l.scientificName ? ` (${l.scientificName})` : ''}, ${l.kind}` +
						`${l.status === 'quarantine' ? ', in quarantine' : ''}${l.addedAt ? `, added ${l.addedAt}` : ''}${l.source ? `, from ${cell(l.source)}` : ''}`
				)
			: ['None recorded.']
	);
	const plants = listPlants(user.id, t.id);
	section(
		plants.length ? `Plants (${plants.length})` : 'Plants',
		plants.length
			? plants.map(
					(p) =>
						`- ${p.name}${p.scientificName && p.scientificName !== p.name ? ` (${p.scientificName})` : ''}, ${p.position}, ${p.status}` +
						`${p.lastTrimmedAt ? `, last trimmed ${day(p.lastTrimmedAt)}` : ''}`
				)
			: ['None recorded.']
	);
	const gear = listEquipment(user.id, t.id);
	section(
		'Equipment',
		gear.length
			? gear.map((e) =>
					[
						`- ${EQUIPMENT_TYPE_LABEL[e.type]}: ${equipmentName(e)}`,
						...specSummary(e.type, e.specs, user),
						e.installedAt ? `since ${e.installedAt}` : null,
						e.lastServicedAt ? `last serviced ${day(e.lastServicedAt)}` : null,
						e.notes ? `note: "${cell(e.notes)}"` : null
					]
						.filter(Boolean)
						.join(' · ')
				)
			: ['None recorded.']
	);

	// ── Schedule ────────────────────────────────────────────────────────────
	const tasks = listTasks(user.id, t.id);
	section(
		'Maintenance schedule',
		tasks.length
			? tasks.map(({ task }) => {
					const due = effectiveDue(task);
					const d = due ? dueInfo(due, today) : null;
					const when = !d ? 'no date' : d.days < 0 ? `overdue by ${plural(-d.days, 'day')} (due ${due})` : d.days === 0 ? 'due today' : `next due ${due}`;
					return `- ${task.name}: ${intervalText(task)}, ${when}`;
				})
			: ['No reminders set.']
	);

	return out.join('\n') + '\n';
}
