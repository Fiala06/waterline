// Short explanations behind the ⓘ next to parameters and less obvious fields
// (IDEAS: tooltips). Plain hobby guidance; each tank's own targets still rule.

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

export const TIPS = {
	nominalVolume: 'The tank’s size as sold, like a 40 gallon tank.',
	actualVolume:
		'The water it really holds once substrate, rock and decor take their space, often 10–20% less. Water change amounts use it when it’s set.',
	sourceWater:
		'Tap: tap water with a conditioner. RODI: water from a reverse osmosis and deionization filter, with almost nothing left in it; most tanks need minerals added back. Mix: some of each.'
};
