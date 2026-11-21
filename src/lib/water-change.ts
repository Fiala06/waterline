// One rule for how much water a single water change can be (#308), shared by
// the log forms (new, edit, a test's "Also log a water change"), the history
// spreadsheet import and favorites / routine steps.

/**
 * Slack for rounding: the form shows the tank's volume to one decimal, and a
 * keeper typing "40 gal" for a 151.4 L tank must not be refused, so a volume
 * up to 0.5% over what the tank holds still counts as the whole tank.
 */
const SLACK = 1.005;

export const PERCENT_LIMIT_ERROR = 'Enter a percentage up to 100.';

/** "Enter up to 40 gal, the tank's water volume." */
export const volumeLimitError = (tankVolume: string, unit: string) => `Enter up to ${tankVolume} ${unit}, the tank's water volume.`;

/** A volume (litres) is more than one change can take from a tank of `tankVolumeL`; never when the tank's size isn't known. */
export function volumeOverTank(volumeL: number, tankVolumeL: number | null | undefined): boolean {
	return !!tankVolumeL && tankVolumeL > 0 && volumeL > tankVolumeL * SLACK;
}

/**
 * The percent a volume is of the tank, to one decimal, capped at 100 so a
 * volume within the rounding slack reads as 100%; null when the size isn't known.
 */
export function percentOfTank(volumeL: number, tankVolumeL: number | null | undefined): number | null {
	if (!tankVolumeL || tankVolumeL <= 0) return null;
	return Math.min(100, Math.round((volumeL / tankVolumeL) * 1000) / 10);
}
