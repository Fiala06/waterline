// A smart plug's state in words (#203), for the Equipment tab, the item's page
// and the plug's own page. Status is the glyph and word, never a tint alone.

export interface PlugStatus {
	on: boolean | null;
	watts: number | null;
	lastError: string | null;
}

/**
 * "● On · 4.2 W", "○ Off", "✕ Not answering", "– No reading yet". A doser on
 * its plug (#205) runs while it has power: "● Running", and off between doses
 * is how it should be.
 */
export function plugText(p: PlugStatus & { runs?: boolean }): { text: string; level: 'ok' | 'warn' | 'bad' | 'none' } {
	if (p.lastError) return { text: '✕ Not answering', level: 'bad' };
	if (p.on == null) return { text: '– No reading yet', level: 'none' };
	if (!p.on) return { text: '○ Off', level: p.runs ? 'none' : 'warn' };
	return { text: `● ${p.runs ? 'Running' : 'On'}${p.watts != null ? ` · ${wattsText(p.watts)}` : ''}`, level: 'ok' };
}

/** "4.2 W", "12 W", "0 W" */
export const wattsText = (w: number) => `${w >= 10 || w === 0 ? Math.round(w) : Math.round(w * 10) / 10} W`;
