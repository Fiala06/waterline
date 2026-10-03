// Species care ranges (#20): temperature, pH and hardness ranges, adult size
// and schooling for the fish in the bundled species list, from FishBase.
// FishBase is CC BY-NC, so nothing of it is in the repo: each server downloads
// the snapshot rfishbase publishes (Source Cooperative, Apache Parquet), keeps
// what matches the bundled list in DATA_DIR/species-care.json, and credits
// FishBase where it's shown. Without internet, or with the switch off, the app
// works as before: names only, no ranges or warnings.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { parquetReadObjects } from 'hyparquet';
import { env } from '$env/dynamic/private';
import type { Care } from '$lib/care';
import { dataDir } from './instance';
import { logger } from './log';
import { getServerSettings } from './mail';
import { allSpecies } from './species';

export const CARE_SOURCE = { name: 'FishBase', url: 'https://www.fishbase.org', license: 'CC BY-NC 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/' };
/** rfishbase's snapshots: a folder per release ("v26.06") with one Parquet file per table. */
const S3 = 'https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop';
const PREFIX = 'cboettig/fishbase/fb/';
const TABLES = ['species', 'synonyms', 'stocks', 'ecology'] as const;

export interface CareFile {
	source: string;
	version: string;
	fetchedAt: string;
	count: number;
	species: Record<string, Care>;
}

const careFile = () => join(dataDir(), 'species-care.json');
export const speciesCareOn = () => env.SPECIES_CARE !== 'off' && getServerSettings().speciesCare;

let loaded: { path: string; file: CareFile | null } | null = null;
let lastError: string | null = null;
let lastTried = 0;
let downloading: Promise<CareFile> | null = null;

/** The care file on this server, read once (and again after a download); null until downloaded. */
export function loadCare(): CareFile | null {
	const path = careFile();
	if (loaded?.path === path) return loaded.file;
	let file: CareFile | null = null;
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as CareFile;
		if (parsed && typeof parsed === 'object' && parsed.species) file = parsed;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'ENOENT') logger.warn('server', `Couldn't read ${path}: downloading the care data again`, { error: e });
	}
	loaded = { path, file };
	return file;
}

/** One species' care, by scientific name; null when unknown or the feature is off. */
export function careFor(scientificName: string | null | undefined): Care | null {
	if (!scientificName || !speciesCareOn()) return null;
	return loadCare()?.species[scientificName.trim()] ?? null;
}

/** For Server settings: what this server has, and the last problem. */
export function careStatus() {
	const f = loadCare();
	return {
		on: speciesCareOn(),
		off: env.SPECIES_CARE === 'off',
		have: !!f,
		version: f?.version ?? null,
		fetchedAt: f?.fetchedAt ?? null,
		count: f?.count ?? 0,
		downloading: !!downloading,
		error: lastError,
		source: CARE_SOURCE
	};
}

// ── Building the file from FishBase's tables ────────────────────────────────

export interface FishBaseRows {
	species: { SpecCode: number; Genus: string; Species: string; FBname?: string | null; Length?: number | null }[];
	/** older names the hobby still uses ("Corydoras paleatus" is FishBase's Hoplisoma paleatum) */
	synonyms?: { SpecCode: number; SynGenus: string; SynSpecies: string; Status?: string | null }[];
	stocks: { SpecCode: number; TempMin?: number | null; TempMax?: number | null; pHMin?: number | null; pHMax?: number | null; dHMin?: number | null; dHMax?: number | null; Level?: string | null }[];
	ecology: { SpecCode: number; Schooling?: number | boolean | null; Shoaling?: number | boolean | null }[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'bigint' ? Number(v) : null);
const range = (a: unknown, b: unknown): [number, number] | null => {
	const lo = num(a);
	const hi = num(b);
	if (lo == null || hi == null || lo > hi) return null;
	return [round(lo), round(hi)];
};
const round = (v: number) => Math.round(v * 10) / 10;
const yes = (v: unknown) => v === true || v === 1 || v === -1 || v === 1n || v === -1n;

/**
 * The bundled species' care from FishBase's rows: only names in `wanted`, by
 * the accepted name or a synonym, a species' general stock first. The care is
 * keyed by the name the bundled list uses.
 */
export function buildCare(rows: FishBaseRows, wanted: Set<string>): Record<string, Care> {
	const bySpec = new Map<number, { name: string; fb: string | null; length: number | null }>();
	const species = new Map(rows.species.map((r) => [Number(r.SpecCode), r]));
	const matched = new Set<string>();
	for (const r of rows.species) {
		const name = `${r.Genus} ${r.Species}`.trim();
		if (!wanted.has(name)) continue;
		matched.add(name);
		bySpec.set(Number(r.SpecCode), { name, fb: r.FBname?.trim() || null, length: num(r.Length) != null ? round(num(r.Length)!) : null });
	}
	for (const syn of rows.synonyms ?? []) {
		const name = `${syn.SynGenus} ${syn.SynSpecies}`.trim();
		const code = Number(syn.SpecCode);
		if (!wanted.has(name) || matched.has(name) || bySpec.has(code) || (syn.Status ?? 'synonym') !== 'synonym') continue;
		const r = species.get(code);
		if (!r) continue;
		matched.add(name);
		bySpec.set(code, { name, fb: r.FBname?.trim() || null, length: num(r.Length) != null ? round(num(r.Length)!) : null });
	}
	const stocks = new Map<number, FishBaseRows['stocks'][number]>();
	for (const s of rows.stocks) {
		const code = Number(s.SpecCode);
		if (!bySpec.has(code)) continue;
		const have = stocks.get(code);
		// "species in general" over a local stock; else the first with any range
		const general = (s.Level ?? '').toLowerCase().includes('general');
		const any = [s.TempMin, s.TempMax, s.pHMin, s.pHMax, s.dHMin, s.dHMax].some((v) => num(v) != null);
		if (!have || (general && !(have.Level ?? '').toLowerCase().includes('general')) || (!any ? false : ![have.TempMin, have.TempMax, have.pHMin, have.pHMax, have.dHMin, have.dHMax].some((v) => num(v) != null))) stocks.set(code, s);
	}
	const school = new Map<number, boolean>();
	for (const e of rows.ecology) {
		const code = Number(e.SpecCode);
		if (!bySpec.has(code)) continue;
		if (yes(e.Schooling) || yes(e.Shoaling)) school.set(code, true);
	}
	const out: Record<string, Care> = {};
	for (const [code, sp] of bySpec) {
		const s = stocks.get(code);
		const care: Care = {
			fb: sp.fb,
			temp: s ? range(s.TempMin, s.TempMax) : null,
			ph: s ? range(s.pHMin, s.pHMax) : null,
			gh: s ? range(s.dHMin, s.dHMax) : null,
			length: sp.length,
			school: school.get(code) ?? null
		};
		if (care.temp || care.ph || care.gh || care.length || care.school) out[sp.name] = care;
	}
	return out;
}

// ── Downloading ─────────────────────────────────────────────────────────────

const UA = 'Waterline (self-hosted aquarium log; https://github.com/Fiala06/waterline)';
const compressors = { ZSTD: (input: Uint8Array) => new Uint8Array(zstdDecompressSync(input)) };

/** The newest release folder on Source Cooperative ("v26.06"), from the S3 listing. */
export async function latestRelease(fetcher: typeof fetch = fetch): Promise<string> {
	const res = await fetcher(`${S3}?list-type=2&prefix=${PREFIX}&delimiter=/`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
	if (!res.ok) throw new Error(`Source Cooperative answered ${res.status} to the release listing`);
	const xml = await res.text();
	const versions = [...xml.matchAll(/<Prefix>[^<]*\/(v\d{2}\.\d{2})\/<\/Prefix>/g)].map((m) => m[1]).sort();
	if (!versions.length) throw new Error('No FishBase releases found in the listing');
	return versions[versions.length - 1];
}

/** Read a table's Parquet file from a release folder (an https URL or, for tests, a file: one), the columns asked for. */
async function readTable(base: string, table: string, columns: string[], fetcher: typeof fetch): Promise<Record<string, unknown>[]> {
	const url = `${base.replace(/\/+$/, '')}/${table}.parquet`;
	let buffer: ArrayBuffer;
	if (url.startsWith('file:')) {
		const b = readFileSync(new URL(url));
		buffer = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
	} else {
		const res = await fetcher(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(120_000) });
		if (!res.ok) throw new Error(`${url} answered ${res.status}`);
		buffer = await res.arrayBuffer();
	}
	return parquetReadObjects({ file: buffer, columns, compressors });
}

/**
 * Download FishBase's tables and keep the bundled species' care in DATA_DIR.
 * SPECIES_CARE_URL points at a release folder instead (a mirror, or file:… in
 * tests). One download at a time; errors are logged and kept for Settings.
 */
export function downloadCare(fetcher: typeof fetch = fetch): Promise<CareFile> {
	if (downloading) return downloading;
	downloading = (async () => {
		lastTried = Date.now();
		try {
			const base = env.SPECIES_CARE_URL || `${S3}/${PREFIX}${await latestRelease(fetcher)}/parquet`;
			const version = /(v\d{2}\.\d{2})/.exec(base)?.[1] ?? 'snapshot';
			const optional = (table: string, columns: string[], what: string) =>
				readTable(base, table, columns, fetcher).catch((e) => {
					logger.warn('server', `FishBase's ${table} table couldn't be read; ${what}`, { error: e });
					return [] as Record<string, unknown>[];
				});
			const [species, synonyms, stocks, ecology] = await Promise.all([
				readTable(base, 'species', ['SpecCode', 'Genus', 'Species', 'FBname', 'Length'], fetcher),
				optional('synonyms', ['SpecCode', 'SynGenus', 'SynSpecies', 'Status'], 'species the hobby knows by an older name go without'),
				readTable(base, 'stocks', ['SpecCode', 'TempMin', 'TempMax', 'pHMin', 'pHMax', 'dHMin', 'dHMax', 'Level'], fetcher),
				optional('ecology', ['SpecCode', 'Schooling', 'Shoaling'], 'schooling comes from the hobby list only')
			]);
			const wanted = new Set(allSpecies().filter((s) => s.kind === 'fish').map((s) => s.s));
			const care = buildCare({ species, synonyms, stocks, ecology } as FishBaseRows, wanted);
			const file: CareFile = { source: CARE_SOURCE.name, version, fetchedAt: new Date().toISOString(), count: Object.keys(care).length, species: care };
			mkdirSync(dataDir(), { recursive: true });
			writeFileSync(careFile(), JSON.stringify(file));
			loaded = { path: careFile(), file };
			lastError = null;
			logger.info('server', `Species care data from FishBase ${version}: ${file.count} of the bundled fish matched`, { tables: TABLES.join(', ') });
			return file;
		} catch (e) {
			lastError = e instanceof Error ? (e.name === 'TimeoutError' ? 'timed out' : e.message) : String(e);
			logger.warn('server', `Couldn't download the species care data from FishBase: ${lastError}`, { error: e });
			throw e;
		} finally {
			downloading = null;
		}
	})();
	return downloading;
}

/** From the scheduler: fetch the data once when it's missing, trying again a day after a failure. */
export async function ensureCare() {
	if (!speciesCareOn() || loadCare() || downloading) return;
	if (Date.now() - lastTried < 86_400_000) return;
	await downloadCare().catch(() => {});
}
