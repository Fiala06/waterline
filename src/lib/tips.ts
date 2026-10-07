// Short explanations behind the ⓘ next to parameters and less obvious fields
// Plain hobby guidance; each tank's own targets still rule.

const PARAMS: Record<string, string> = {
	ph: 'How acidic or alkaline the water is, from 0 to 14. Most fish do well across a range; keeping it steady matters more than a perfect number.',
	nh3: "Comes from fish waste, leftover food and decay, and is toxic even in small amounts. It should read 0 in a cycled tank; any ammonia means the filter's bacteria can't keep up.",
	no2: 'Made from ammonia by the filter’s bacteria, and toxic to fish: it stops their blood carrying oxygen. It should read 0 once the tank has cycled.',
	no3: 'The last step of the nitrogen cycle. Far less toxic than ammonia or nitrite, but it builds up over time; water changes bring it down, and plants use some.',
	gh: 'General hardness: the calcium and magnesium dissolved in the water. Fish, shrimp and plants need some, soft-water species less. 1 dGH is about 17.9 ppm.',
	kh: 'Carbonate hardness, the water’s buffer against pH swings. Low KH lets pH drop suddenly, which stresses fish and shrimp. 1 dKH is about 17.9 ppm.',
	temp: 'Most tropical fish need 74–80 °F (23–27 °C). A quick change of a few degrees stresses fish more than a steady temperature near the edge of the range.',
	po4: 'A plant nutrient that also comes from fish food. Growing plants use it up; too much with too few plants feeds algae.',
	k: 'A main plant nutrient, added by most fertilizers. Too little shows as pinholes in older leaves.',
	fe: 'A plant nutrient for green, healthy new leaves. Plants use it quickly, so it’s usually added a little at a time with fertilizer.',
	tds: 'Total dissolved solids: everything in the water, in ppm. A quick pen reading that shrimp keepers use daily, and the usual check after remineralising RODI water.',
	ec: 'Conductivity, how well the water carries a current, in µS/cm. It rises with dissolved minerals, so it tracks TDS and shows drift between water changes.',
	orp: 'Oxidation-reduction potential, in mV: how much oxidising power the water has. Ozone and good skimming raise it; a sudden drop points to something decaying.',
	co2: 'Carbon dioxide dissolved in the water, which plants use to grow. Planted tanks often aim for 20–30 ppm; much higher and fish struggle to breathe.',
	sal: 'How salty the water is, in parts per thousand. Brackish tanks run from a little salt to less than half as salty as the sea, depending on the species.',
	ca: 'Corals, clams and coralline algae build their skeletons from it. Reef tanks usually keep 400–450 ppm, dosed together with alkalinity.',
	mg: 'Keeps calcium and alkalinity from dropping out of the water. Reef tanks usually keep 1250–1400 ppm.'
};

// the same keys mean something a little different in a reef
const REEF: Record<string, string> = {
	kh: 'Alkalinity: the reef’s buffer, and what corals use with calcium to build their skeletons. Keep it steady; swings stress corals more than a slightly low number.',
	po4: 'Comes from food and waste. Corals like it very low; too much fuels nuisance algae and slows coral growth.',
	no3: 'The last step of the nitrogen cycle. Corals like a little; a lot fuels algae. Water changes and a skimmer keep it down.',
	sal: 'How salty the water is, in parts per thousand. Reef tanks usually keep about 35 ppt (1.025–1.026 specific gravity). Top up evaporation with fresh water: salt doesn’t evaporate.'
};

/** What a standard parameter is, for the tank's type; null for custom ones. */
export function paramTip(key: string, tankType: string): string | null {
	return (tankType === 'reef' ? REEF[key] : undefined) ?? PARAMS[key] ?? null;
}

// When a test is worth doing (#91): routine tests say how often, the rest say
// "Optional" first, so a beginner sees which matter weekly and which can wait.
export interface WhenToTest {
	text: string;
	/** a test most keepers of this tank type can skip */
	optional: boolean;
}
const w = (text: string, optional = false): WhenToTest => ({ text, optional });
const WHEN: Record<string, WhenToTest> = {
	ph: w('Weekly while a tank is new, then when something changes: new fish, a different water source, or another reading that looks off. Steady matters more than often.'),
	nh3: w("Every day or two while a tank cycles or after adding fish, and any time fish look unwell. In a settled tank, weekly or when something's wrong."),
	no2: w("Every day or two while a tank cycles or after adding fish, and any time fish look unwell. In a settled tank, weekly or when something's wrong."),
	no3: w('Weekly, or just before a water change: it shows whether your changes are big and often enough.'),
	gh: w('Optional for most tanks: when setting up, after changing your water source, and if shrimp or plants struggle. Tap water rarely changes.', true),
	kh: w('Optional unless pH drifts: when setting up, after changing your water source, with CO₂ injection, or whenever pH drops for no clear reason.', true),
	temp: w('A glance at the thermometer each day; log it when it drifts, in a heatwave, or after a heater change.'),
	po4: w('Optional unless you dose fertilizer or are fighting algae: weekly then, alongside nitrate.', true),
	k: w('Optional: mainly for fertilizer management in a heavily planted tank, or when older leaves show pinholes.', true),
	fe: w('Optional: useful mainly for fertilizer management in heavily planted tanks. A weekly check if you dose iron on its own.', true),
	tds: w('Optional for most tanks. Shrimp keepers and anyone remineralising RO water check it with each water change, some daily.', true),
	ec: w('Optional: the same job as TDS with a different meter. Check it with each water change if you remineralise RO water.', true),
	orp: w('Optional: a probe reads it all day, so log it when it moves. A sudden drop is what matters, not the number.', true),
	co2: w('With injected CO₂, watch the drop checker daily and log a reading when you change the rate. Without injection, skip it.'),
	sal: w('With each water change and top-up: evaporation leaves the salt behind, so it creeps up between them.'),
	ca: w('Weekly in a reef with stony corals, and after changing a dose; monthly in a soft-coral tank.'),
	mg: w("Every 2–4 weeks: it moves slowly. Check it when calcium or alkalinity won't hold.")
};
const WHEN_PLANTED: Record<string, WhenToTest> = {
	po4: w('Weekly if you dose fertilizer, alongside nitrate, so the two stay in step. Optional in a low-tech tank with no dosing.'),
	kh: w('When setting up, after changing your water source, and weekly if you inject CO₂: KH decides how far the CO₂ pushes pH down.')
};
const WHEN_REEF: Record<string, WhenToTest> = {
	kh: w('Two or three times a week when dosing, weekly otherwise: alkalinity moves fastest, and corals mind swings most.'),
	po4: w('Weekly, with nitrate: corals like a little, algae likes more.'),
	no3: w('Weekly, with phosphate: corals like a little, algae likes more.'),
	sal: w('Weekly, and before mixing new salt water: evaporation leaves the salt behind. Daily if nothing tops the tank up for you.'),
	ph: w('Optional with a probe: it swings between day and night, so the trend matters more than one reading. Without one, weekly.', true)
};

/** When a standard parameter is worth testing, for the tank's type; null for custom ones. */
export function whenToTest(key: string, tankType: string): WhenToTest | null {
	const byType = tankType === 'reef' ? WHEN_REEF : tankType === 'planted' ? WHEN_PLANTED : undefined;
	return byType?.[key] ?? WHEN[key] ?? null;
}

// What to do about a reading out of range (#62): one plain next step under it
// in Needs attention, by parameter and direction. Reef wording where it differs.
type Steps = Partial<Record<'high' | 'low', string>>;
const NEXT: Record<string, Steps> = {
	nh3: { high: 'Change 30–50% of the water with conditioned water, feed lightly and test again tomorrow.' },
	no2: { high: 'Change 30–50% of the water with conditioned water, feed lightly and test again tomorrow.' },
	no3: {
		high: 'A bigger water change brings it down; more plants and less food keep it there.',
		low: 'Plants may go hungry: dose a fertilizer with nitrogen, or change water a little less.'
	},
	ph: {
		high: 'Steady matters more than the number. Skip pH chemicals; check KH and what your tap water reads first.',
		low: 'Steady matters more than the number. Skip pH chemicals; check KH, which keeps pH from dropping.'
	},
	kh: {
		high: 'Hard tap water is often the cause. Mixing in some RO or rain water brings it down slowly.',
		low: 'Low KH lets pH drop suddenly. Water changes with tap water, or a little baking soda, raise it.'
	},
	gh: {
		high: 'Hard tap water is often the cause. Mixing in some RO or rain water brings it down slowly.',
		low: 'Add minerals back: water changes with tap water, or a GH remineralizer for RO water.'
	},
	temp: {
		high: 'Turn the heater down or off, keep the lid open and the room cooler; change it slowly.',
		low: 'Check the heater is on and big enough for the tank; raise it a degree or two a day.'
	},
	po4: {
		high: 'Feed a little less and change some water; in a planted tank, check the light isn’t on too long.',
		low: 'Plants may go hungry: dose a fertilizer with phosphate.'
	},
	k: { low: 'Dose a fertilizer with potassium.', high: 'Dose less fertilizer until it drops; a water change helps.' },
	fe: { low: 'Dose an iron or all-in-one fertilizer a little at a time.', high: 'Dose less fertilizer until it drops; a water change helps.' },
	co2: {
		high: 'Turn the CO₂ down now and add surface movement: fish gasping at the top is the warning sign.',
		low: 'Raise the CO₂ a little at a time, a bubble at a time, and give it a day to settle.'
	},
	tds: {
		high: 'Water changes bring it down; with RO water, add less remineralizer.',
		low: 'Add a little more remineralizer to the new water.'
	},
	ec: {
		high: 'Water changes bring it down; with RO water, add less remineralizer.',
		low: 'Add a little more remineralizer to the new water.'
	},
	ca: {
		high: 'Pause the calcium dose until it comes down; check the test with a second kit.',
		low: 'Raise the calcium dose a little at a time, and check magnesium: low magnesium drags it down.'
	},
	mg: {
		high: 'Pause the magnesium dose; water changes bring it down slowly.',
		low: 'Dose magnesium a little at a time, up to about 100 ppm a day.'
	},
	orp: {
		high: 'Cut back the ozone, if you use it, until it settles.',
		low: 'Look for something decaying, clean the skimmer and change some water.'
	},
	sal: {
		high: 'Top up evaporated water with fresh water, not salt water, a little at a time.',
		low: 'Change some water with saltier water, a little at a time.'
	}
};
const REEF_NEXT: Record<string, Steps> = {
	kh: {
		high: 'Pause or cut back the alkalinity dose until it comes down.',
		low: 'Raise the alkalinity dose a little at a time: no more than 1 dKH a day.'
	},
	no3: {
		high: 'Water changes, a little less food and a clean skimmer bring it down.',
		low: 'Corals like a little: feed a bit more, or cut back what removes it.'
	},
	po4: {
		high: 'Feed a little less, change some water and check the skimmer; a phosphate remover helps.',
		low: 'Corals like a little: feed a bit more, or cut back what removes it.'
	},
	ph: {
		high: 'Usually follows alkalinity dosing; check alkalinity first.',
		low: 'Often a stuffy room: more fresh air or a skimmer air line from outside raises it.'
	}
};

/** One plain next step for a reading out of range; null for custom parameters. */
export function nextStep(key: string, direction: 'high' | 'low' | null, tankType: string): string | null {
	if (!direction) return null;
	return (tankType === 'reef' ? REEF_NEXT[key]?.[direction] : undefined) ?? NEXT[key]?.[direction] ?? null;
}

export const TIPS = {
	nominalVolume: 'The tank’s size as sold, like a 40 gallon tank.',
	actualVolume:
		'The water it really holds once substrate, rock and decor take their space, often 10–20% less. Water change amounts use it when it’s set.',
	sourceWater:
		'Tap: tap water with a conditioner. RODI: water from a reverse osmosis and deionization filter, with almost nothing left in it; most tanks need minerals added back. Mix: some of each.'
};
