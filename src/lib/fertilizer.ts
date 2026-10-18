// What a dosed product is, from its name: whether it feeds plants nitrogen, is
// something else a keeper doses (a conditioner, bacteria, a medicine, a buffer,
// a fertilizer without nitrogen), or can't be told. The suggested steps (#179)
// name only a product that adds nitrogen when nitrate runs out.

export type NitrogenSource = 'yes' | 'no' | 'unknown';

/** Products and words that add nitrogen: all-in-one and macro fertilizers, and nitrate salts. */
const NITROGEN = [
	/\bnitrogen\b/,
	/\bnitrate\b/,
	/\bkno3\b/,
	/\bnpk\b/,
	/\bmacros?\b/,
	/\ball[\s-]?in[\s-]?one\b/,
	/\bthrive\b/,
	/\beasy[\s-]?green\b/,
	/\btropica\b.*\bspeciali[sz]ed\b/,
	/\bapt\s*(complete|3|one|feed)\b/,
	/\bnilocg\b/,
	/\bcomplete\b.*\bfert/
];

/**
 * Doses that don't add nitrogen: conditioners, bacteria, medicines, buffers and
 * minerals, and the fertilizers made without it (Seachem Flourish, Tropica
 * Premium, iron or potassium on their own).
 */
const NOT_NITROGEN = [
	/\bprime\b/,
	/\bcondition/,
	/\bdechlor/,
	/\bsafe\b/,
	/\bstress\s*coat\b/,
	/\baqua\s*safe\b/,
	/\bstability\b/,
	/\bbacteria|\bbacterial|\bbio[\s-]?(start|spira|safe)|\bquick\s*start\b|\bfritz\s*zyme\b|\bturbo\s*start\b/,
	/\bmetro|\bparaguard\b|\bich\b|\bmedic|\bpraziquantel\b|\bprazi\b|\bfenbendazole\b|\bkanaplex\b|\bmaracyn\b|\bsalt\b|\bmelafix\b|\bpimafix\b|\bcopper\b|\bexpel\b/,
	/\bbuffer\b|\bph\s*(up|down)\b|\bequilibrium\b|\bgh\b|\bkh\b|\bremineral|\balkalinity\b|\bcalcium\b|\bmagnesium\b|\bsalinity\b/,
	/\bexcel\b|\bglutaraldehyde\b|\bliquid\s*carbon\b|\bcarbon\b/,
	/\bapt\s*zero\b/,
	/\btropica\b.*\bpremium\b/,
	/^(seachem\s+)?flourish(\s+comprehensive)?$/,
	/\bflourish\s+(iron|potassium|phosphorus|trace|excel)\b/,
	/\biron\b|\bpotassium\b|\bphosph|\btrace\b|\bmicros?\b|\bcsm\s*\+?\s*b\b/
];

/** Whether a dosed product adds nitrogen, by its name; a saved product's strength of nitrate says yes. */
export function nitrogenSource(product: string, strengthOf?: string | null): NitrogenSource {
	if (strengthOf && /nitrate|nitrogen|\bno3\b|\bn\b/i.test(strengthOf)) return 'yes';
	const name = product.toLowerCase().replace(/[’']/g, '').trim();
	if (!name) return 'unknown';
	if (NITROGEN.some((r) => r.test(name))) return 'yes';
	if (NOT_NITROGEN.some((r) => r.test(name))) return 'no';
	return 'unknown';
}
