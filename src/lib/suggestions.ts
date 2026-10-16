// Suggested steps from readings (#179): when a test reads something a keeper
// usually acts on, a step to take with a tap, never on its own. The rules are
// here in one table with where they come from; the sources disagree in the
// details, so each is offered as a suggestion, and each can be switched off
// for a tank (Tank setup › Suggested steps).
import { paramStatus } from './status';
import { fmtDate } from './time';

export const SUGGESTION_RULES = [
	{
		id: 'water_change_until_clear',
		name: 'Ammonia or nitrite in a cycled tank',
		when: 'Ammonia or nitrite above 0 in a tank that isn’t cycling',
		step: 'Water change every 2 days until it reads 0, then back to the usual',
		source: 'API and Seachem guidance on ammonia and nitrite; planted-tank forums'
	},
	{
		id: 'dose_nitrate',
		name: 'Nitrate at 0 in a dosed tank',
		when: 'Nitrate reads 0 in a tank with dosing',
		step: 'Dose now, with the tank’s usual product',
		source: 'The Barr Report on Estimative Index dosing; 2Hr Aquarist'
	},
	{
		id: 'phosphate_green_spot',
		name: 'Low phosphate with green spot algae',
		when: 'Phosphate below 0.1 ppm with green spot algae logged in the last 2 weeks',
		step: 'A note on why: green spot algae often comes with phosphate this low',
		source: 'Tropica and 2Hr Aquarist on green spot algae'
	}
] as const;

export type SuggestionRuleId = (typeof SUGGESTION_RULES)[number]['id'];
export const isSuggestionRule = (v: unknown): v is SuggestionRuleId => SUGGESTION_RULES.some((r) => r.id === v);

/** Phosphate below this (ppm, the same as mg/L) with green spot algae: worth a note. */
export const LOW_PHOSPHATE = 0.1;
/** Green spot algae logged this many days back still counts. */
export const GREEN_SPOT_DAYS = 14;
/** The water change's cadence while ammonia or nitrite shows. */
export const CLEAR_EVERY = 2;

export interface SuggestReading {
	paramId: string;
	/** the standard parameter's key: nh3, no2, no3, po4; custom ones are left out */
	key: string;
	/** stored value (mg/L for these) */
	value: number;
	name: string;
}

export interface SuggestContext {
	tankId: string;
	readings: SuggestReading[];
	/** cycled: not cycling, and past being new or said Not cycling */
	cycled: boolean;
	/** the tank's water-change routine that repeats every so many days (its usual cadence), and whether it's already more often */
	waterChange: { id: string; name: string; intervalDays: number; clearing: boolean } | null;
	/** dosed: a dosing routine, or a dose logged lately; and the product it usually is */
	dosed: boolean;
	product: string | null;
	/** green spot algae logged lately: the entry and its day */
	greenSpot: { eventId: string; date: string } | null;
	/** rules switched off for this tank */
	off: readonly string[];
}

export type Suggestion = {
	rule: SuggestionRuleId;
	/** the reading it's about, to show it under */
	paramId: string;
	/** what and why, in a line */
	text: string;
} & (
	| { action: { label: string; taskId: string; every: number } }
	| { link: { label: string; href: string } }
);

/** The steps a tank's readings suggest, in the table's order; none for rules switched off. */
export function suggestSteps(ctx: SuggestContext): Suggestion[] {
	const out: Suggestion[] = [];
	const on = (id: SuggestionRuleId) => !ctx.off.includes(id);
	const reading = (key: string) => ctx.readings.find((r) => r.key === key);

	// ammonia, then nitrite: the water change more often until it reads 0
	const toxic = ['nh3', 'no2'].map(reading).find((r) => r && r.value > 0);
	const wc = ctx.waterChange;
	if (on('water_change_until_clear') && toxic && ctx.cycled && wc && wc.intervalDays > CLEAR_EVERY && !wc.clearing) {
		const name = toxic.name.toLowerCase();
		out.push({
			rule: 'water_change_until_clear',
			paramId: toxic.paramId,
			text: `${toxic.name} in a cycled tank: change water every ${CLEAR_EVERY} days until it reads 0, then back to every ${wc.intervalDays} days.`,
			action: { label: `Water change every ${CLEAR_EVERY} days until ${name} reads 0`, taskId: wc.id, every: CLEAR_EVERY }
		});
	}

	// nitrate used up in a dosed tank: dose now
	const no3 = reading('no3');
	if (on('dose_nitrate') && no3 && no3.value <= 0 && ctx.dosed) {
		const q = new URLSearchParams({ tank: ctx.tankId, category: 'dosing' });
		if (ctx.product) q.set('product', ctx.product);
		out.push({
			rule: 'dose_nitrate',
			paramId: no3.paramId,
			text: `Nitrate reads 0, so the plants may go hungry: dose now${ctx.product ? `, with ${ctx.product}` : ''}.`,
			link: { label: 'Dose now', href: `/entries/event/new?${q}` }
		});
	}

	// phosphate this low with green spot algae: the likely reason, as a note
	const po4 = reading('po4');
	if (on('phosphate_green_spot') && po4 && po4.value < LOW_PHOSPHATE && ctx.greenSpot) {
		out.push({
			rule: 'phosphate_green_spot',
			paramId: po4.paramId,
			text: `Green spot algae, logged ${fmtDate(ctx.greenSpot.date)}, often comes with phosphate below ${LOW_PHOSPHATE} ppm: dosing a little phosphate is the usual fix.`,
			link: { label: 'See the algae entry', href: `/entries/event/${ctx.greenSpot.eventId}` }
		});
	}
	return out;
}

/** Ammonia and nitrite clear at 0, whatever the target allows: any is too much in a cycled tank. */
const ZERO_KEYS = ['nh3', 'no2'];
const clearsAtZero = (p: { key: string; max: number | null }) => ZERO_KEYS.includes(p.key) || p.max === 0;

/** What clears a pause or a cadence for a while: "ammonia reads 0", "nitrate is in range". */
export function clearText(param: { key: string; name: string; max: number | null }): string {
	const name = param.name.toLowerCase();
	return clearsAtZero(param) ? `${name} reads 0` : `${name} is in range`;
}

/** Whether a reading clears it: 0 for ammonia and nitrite (or a target of 0), else no longer ✕ out of range. */
export function readingClears(param: { key: string; min: number | null; max: number | null }, value: number): boolean {
	return clearsAtZero(param) ? value <= 0 : paramStatus(value, { min: param.min, max: param.max }).level !== 'bad';
}
