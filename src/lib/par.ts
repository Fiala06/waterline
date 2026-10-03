// PAR readings (#25): where in the tank a reading was taken, as nine zones seen
// from above (across, then front to back), so a phone can place one without a map to tap.
export const PAR_ZONES: { label: string; x: number; y: number }[] = [
	{ label: 'Front left', x: 17, y: 80 },
	{ label: 'Front centre', x: 50, y: 80 },
	{ label: 'Front right', x: 83, y: 80 },
	{ label: 'Middle left', x: 17, y: 50 },
	{ label: 'Centre', x: 50, y: 50 },
	{ label: 'Middle right', x: 83, y: 50 },
	{ label: 'Back left', x: 17, y: 20 },
	{ label: 'Back centre', x: 50, y: 20 },
	{ label: 'Back right', x: 83, y: 20 }
];

/** How a PAR reading reads for corals: low light, moderate, or high, in words. */
export function parBand(value: number): string {
	if (value < 50) return 'Low light · shade corals';
	if (value < 150) return 'Moderate · LPS, soft corals';
	if (value < 300) return 'Bright · most SPS';
	return 'Intense · high-light SPS, clams';
}
