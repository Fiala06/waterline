// Test kits (#21): the steps of a liquid or strip test, with the waits that
// matter ("shake 30 s, then wait 5 min"), so the water test form can run them
// with a timer while the other readings are typed in.

export interface KitStep {
	text: string;
	/** a timed step: how long to shake or wait, in seconds; omitted for "add 10 drops" */
	seconds?: number;
}

export interface KitLike {
	name: string;
	/** which parameter it's for: ph, nh3, no2, no3, gh, kh, temp, or custom:<name> for a custom parameter */
	paramKey: string;
	steps: KitStep[];
}

export const MAX_STEPS = 12;
export const MAX_STEP_SECONDS = 60 * 60;

/** The key a kit is filed under for a parameter: the standard key, or the custom parameter's name. */
export const kitKeyFor = (p: { key: string; name: string }) => (p.key === 'custom' ? `custom:${p.name.trim().toLowerCase()}` : p.key);

/** "6 min", "5 min 30 s", "30 s" */
export function fmtDuration(seconds: number): string {
	const s = Math.max(0, Math.round(seconds));
	const m = Math.floor(s / 60);
	const r = s % 60;
	if (!m) return `${r} s`;
	return r ? `${m} min ${r} s` : `${m} min`;
}

/** "5:00", "0:30", for a running countdown */
export function fmtClock(seconds: number): string {
	const s = Math.max(0, Math.ceil(seconds));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** All the timed steps added up: how long the test takes once started. */
export const kitSeconds = (k: Pick<KitLike, 'steps'>) => k.steps.reduce((n, s) => n + (s.seconds ?? 0), 0);

/** Steps as one line: "5 mL · 8 drops bottle 1 · 8 drops bottle 2 · shake 5 s · wait 5 min". */
export const kitLine = (k: Pick<KitLike, 'steps'>) => k.steps.map((s) => s.text).join(' · ');

/**
 * Steps typed one per line, a wait or shake read from the end of the line:
 * "Shake 30 s", "Wait 5 min", "Shake for 1 minute". Blank lines are skipped.
 */
export function parseSteps(text: string): KitStep[] {
	return text
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.slice(0, MAX_STEPS)
		.map((line) => {
			const m = line.match(/(\d+(?:[.,]\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes)\b\.?$/i);
			if (!m) return { text: line };
			const n = Number(m[1].replace(',', '.'));
			const seconds = Math.round(/^m/i.test(m[2]) ? n * 60 : n);
			if (!(seconds > 0) || seconds > MAX_STEP_SECONDS) return { text: line };
			return { text: line, seconds };
		});
}

/** The lines back, for the editor. */
export const stepsText = (steps: KitStep[]) => steps.map((s) => s.text).join('\n');

/**
 * Presets from the makers' leaflets, to start from and edit. Only kits whose
 * steps we're sure of: API's Freshwater Master and GH & KH kits. Check them
 * against the leaflet in the box; makers change them.
 */
export const KIT_PRESETS: (KitLike & { id: string; maker: string })[] = [
	{
		id: 'api-ph',
		maker: 'API Freshwater Master Test Kit',
		name: 'API pH',
		paramKey: 'ph',
		steps: [{ text: 'Fill the tube to the 5 mL line with tank water' }, { text: 'Add 3 drops of pH test solution' }, { text: 'Cap and invert several times' }, { text: 'Read the colour against the pH chart' }]
	},
	{
		id: 'api-ph-high',
		maker: 'API Freshwater Master Test Kit',
		name: 'API High Range pH',
		paramKey: 'ph',
		steps: [{ text: 'Fill the tube to the 5 mL line with tank water' }, { text: 'Add 5 drops of High Range pH solution' }, { text: 'Cap and invert several times' }, { text: 'Read the colour against the High Range pH chart' }]
	},
	{
		id: 'api-nh3',
		maker: 'API Freshwater Master Test Kit',
		name: 'API Ammonia',
		paramKey: 'nh3',
		steps: [
			{ text: 'Fill the tube to the 5 mL line with tank water' },
			{ text: 'Add 8 drops of Ammonia bottle 1' },
			{ text: 'Add 8 drops of Ammonia bottle 2' },
			{ text: 'Cap and shake 5 s', seconds: 5 },
			{ text: 'Wait 5 min', seconds: 300 },
			{ text: 'Read the colour against the Ammonia chart' }
		]
	},
	{
		id: 'api-no2',
		maker: 'API Freshwater Master Test Kit',
		name: 'API Nitrite',
		paramKey: 'no2',
		steps: [
			{ text: 'Fill the tube to the 5 mL line with tank water' },
			{ text: 'Add 5 drops of Nitrite test solution' },
			{ text: 'Cap and shake 5 s', seconds: 5 },
			{ text: 'Wait 5 min', seconds: 300 },
			{ text: 'Read the colour against the Nitrite chart' }
		]
	},
	{
		id: 'api-no3',
		maker: 'API Freshwater Master Test Kit',
		name: 'API Nitrate',
		paramKey: 'no3',
		steps: [
			{ text: 'Fill the tube to the 5 mL line with tank water' },
			{ text: 'Add 10 drops of Nitrate bottle 1' },
			{ text: 'Cap and invert several times' },
			{ text: 'Shake Nitrate bottle 2 hard for 30 s', seconds: 30 },
			{ text: 'Add 10 drops of Nitrate bottle 2' },
			{ text: 'Cap and shake hard 1 min', seconds: 60 },
			{ text: 'Wait 5 min', seconds: 300 },
			{ text: 'Read the colour against the Nitrate chart' }
		]
	},
	{
		id: 'api-gh',
		maker: 'API GH & KH Test Kit',
		name: 'API GH',
		paramKey: 'gh',
		steps: [{ text: 'Fill the tube to the 5 mL line with tank water' }, { text: 'Add GH drops one at a time, inverting after each, until orange turns green' }, { text: 'The number of drops is the GH in degrees' }]
	},
	{
		id: 'api-kh',
		maker: 'API GH & KH Test Kit',
		name: 'API KH',
		paramKey: 'kh',
		steps: [{ text: 'Fill the tube to the 5 mL line with tank water' }, { text: 'Add KH drops one at a time, inverting after each, until blue turns yellow' }, { text: 'The number of drops is the KH in degrees' }]
	}
];

/** Standard parameter keys a kit can be for, with their names. */
export const KIT_PARAMS: { key: string; name: string }[] = [
	{ key: 'ph', name: 'pH' },
	{ key: 'nh3', name: 'Ammonia' },
	{ key: 'no2', name: 'Nitrite' },
	{ key: 'no3', name: 'Nitrate' },
	{ key: 'gh', name: 'GH' },
	{ key: 'kh', name: 'KH' },
	{ key: 'temp', name: 'Temperature' }
];

export const kitParamName = (key: string) => KIT_PARAMS.find((p) => p.key === key)?.name ?? (key.startsWith('custom:') ? key.slice(7) : key);
