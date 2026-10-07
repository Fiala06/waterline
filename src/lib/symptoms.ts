// Worth checking (#95): for a plant symptom or an algae kind, the things a
// keeper usually looks at, each shown with what the tank's own records say
// (the latest reading, the last dose, the light hours) and where to look.
// Possibilities to check, never a diagnosis: the wording says more than one
// can be true, and none might be; missing data is said to be missing.
import type { AlgaeType, PlantObservation } from './plants';

export type CheckSpec =
	| { param: string; why?: string }
	| { dosing: true; why?: string }
	| { light: true; why?: string }
	| { co2: true; why?: string }
	| { photos: true }
	| { algaeLog: true }
	| { text: string };

export interface SymptomChecks {
	/** one line of context before the list */
	lead: string;
	checks: CheckSpec[];
}

export const PLANT_SYMPTOM_CHECKS: Partial<Record<PlantObservation, SymptomChecks>> = {
	pinholes: {
		lead: 'Pinholes in older leaves are often talked about with potassium, but other things do it too.',
		checks: [
			{ param: 'k' },
			{ text: 'Older leaves wear out first: holes only on old leaves, with clean new growth, matter less.' },
			{ dosing: true, why: 'a recent change in fertilizer' },
			{ photos: true }
		]
	},
	yellowing: {
		lead: 'Yellowing has several everyday causes, and which leaves go yellow is a clue.',
		checks: [{ param: 'fe', why: 'new leaves pale' }, { param: 'no3', why: 'old leaves first' }, { light: true }, { dosing: true }, { photos: true }]
	},
	melting: {
		lead: 'Many plants melt once after planting or a change, then grow back in the new water.',
		checks: [
			{ text: 'New or moved plants: give them a few weeks before changing anything.' },
			{ co2: true },
			{ light: true },
			{ param: 'no3' },
			{ photos: true }
		]
	},
	stunted: {
		lead: 'Slow or stunted growth usually comes back to light, CO₂ or a nutrient that ran out.',
		checks: [{ light: true }, { co2: true }, { param: 'no3' }, { param: 'po4' }, { dosing: true }]
	},
	algae: {
		lead: 'Algae on leaves tends to follow light that’s on too long, or nutrients out of step with each other.',
		checks: [{ light: true }, { param: 'no3' }, { param: 'po4' }, { co2: true }, { algaeLog: true }]
	}
};

export const ALGAE_CHECKS: Record<AlgaeType, SymptomChecks> = {
	'Green spot': {
		lead: 'Hard green dots on glass and slow leaves; often mentioned with low phosphate and long light.',
		checks: [{ param: 'po4' }, { light: true }, { photos: true }]
	},
	'Green dust': {
		lead: 'A green film on the glass that usually runs its course in a few weeks if left to finish.',
		checks: [{ light: true }, { text: 'Wiping it early tends to restart it; many keepers wait it out, then clean once.' }]
	},
	'Hair / thread': {
		lead: 'Fine green threads; usually light and CO₂ out of step, or nutrients that swing.',
		checks: [{ light: true }, { co2: true }, { param: 'no3' }, { dosing: true }]
	},
	'Black beard': {
		lead: 'Dark tufts on edges and hardscape; most often talked about with CO₂ that varies and poor flow.',
		checks: [{ co2: true, why: 'steady from day to day' }, { text: 'Flow: dead spots, a filter that needs a clean, outflow pointed away.' }, { light: true }]
	},
	Staghorn: {
		lead: 'Grey branching strands; often after disturbed substrate or a filter clean, with ammonia about.',
		checks: [{ param: 'nh3' }, { co2: true }, { text: 'Anything stirred up lately: substrate, filter media, a big trim.' }]
	},
	'Diatoms / brown': {
		lead: 'Brown dust that comes with a new tank and usually passes in a few weeks.',
		checks: [{ text: 'A new tank: it tends to go on its own once the tank settles.' }, { light: true }, { text: 'Silicates in tap water keep it going longer.' }]
	},
	'Cyanobacteria / BGA': {
		lead: 'Slimy blue-green sheets with a smell; often where water sits still and nitrate has run out.',
		checks: [{ param: 'no3', why: 'often very low' }, { text: 'Flow: it gathers where the water doesn’t move.' }, { light: true }]
	},
	'Other / unsure': {
		lead: 'Without knowing the kind, the usual suspects are light, nutrients and CO₂.',
		checks: [{ light: true }, { param: 'no3' }, { param: 'po4' }, { co2: true }]
	}
};

export const CHECKS_NOTE = 'Things worth checking, not a diagnosis: more than one can be true, and none might be.';

/** What the tank's own records say, gathered once per tank. */
export interface SymptomFacts {
	tankId: string;
	/** by parameter key: the tracked parameter and its latest reading, if any */
	params: Record<string, { id: string; name: string; latest: { value: string; status: string; when: string } | null }>;
	/** the latest dose logged: "Thrive · 5 mL", and when */
	lastDose: { title: string; when: string } | null;
	/** hours of light a day; null when no schedule is set; 'none' when the tank has no light */
	lightHours: number | null | 'none';
	/** CO₂ injected (a schedule or unit), none on purpose, or not set up */
	co2: boolean | null;
}

export interface Check {
	text: string;
	link: { label: string; href: string } | null;
}

const NAMES: Record<string, string> = { k: 'Potassium', fe: 'Iron', no3: 'Nitrate', po4: 'Phosphate', nh3: 'Ammonia' };

/** Each check with what the records say and where to look. */
export function resolveChecks(specs: CheckSpec[], f: SymptomFacts): Check[] {
	const t = f.tankId;
	return specs.map((s): Check => {
		if ('text' in s) return { text: s.text, link: null };
		if ('photos' in s) return { text: 'Photos from before and after, side by side.', link: { label: 'Photos ›', href: `/photos?tank=${t}` } };
		if ('algaeLog' in s) return { text: 'The algae itself: which kind, how much and where.', link: { label: 'Log algae ›', href: `/tanks/${t}/algae` } };
		if ('param' in s) {
			const p = f.params[s.param];
			const name = p?.name ?? NAMES[s.param] ?? s.param;
			const why = s.why ? ` (${s.why})` : '';
			if (!p) return { text: `${name}${why}: not tracked on this tank.`, link: { label: 'Parameters & targets ›', href: `/tanks/${t}/targets` } };
			if (!p.latest) return { text: `${name}${why}: no readings yet.`, link: { label: 'Log a test ›', href: `/entries/test/new?tank=${t}` } };
			return { text: `${name}${why}: ${p.latest.value} · ${p.latest.status} · ${p.latest.when}.`, link: { label: 'Chart ›', href: `/charts?tank=${t}&p=${p.id}` } };
		}
		if ('dosing' in s) {
			const why = s.why ? ` (${s.why})` : '';
			return f.lastDose
				? { text: `Last dose${why}: ${f.lastDose.title} · ${f.lastDose.when}.`, link: { label: 'Dosing history ›', href: `/history?tank=${t}&cat=dosing` } }
				: { text: `Dosing${why}: no doses logged.`, link: { label: 'Log a dose ›', href: `/entries/event/new?tank=${t}&category=dosing` } };
		}
		if ('light' in s) {
			const why = s.why ? ` (${s.why})` : '';
			const link = { label: 'Tank setup ›', href: `/tanks/${t}/settings#lights` };
			if (f.lightHours === 'none') return { text: `Light${why}: none on this tank.`, link };
			if (f.lightHours == null) return { text: `Light${why}: no schedule set, so the hours aren’t known.`, link };
			return { text: `Light${why}: ${f.lightHours} h a day.`, link };
		}
		const why = s.why ? ` (${s.why})` : '';
		const link = { label: 'Tank setup ›', href: `/tanks/${t}/settings#co2` };
		if (f.co2 === true) return { text: `CO₂${why}: injected, on a schedule.`, link };
		if (f.co2 === false) return { text: `CO₂${why}: none, on purpose.`, link };
		return { text: `CO₂${why}: not set up in Tank setup, so it isn’t known.`, link };
	});
}
