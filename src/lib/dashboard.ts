// Dashboard personalization (#94): a few light choices per tank, kept on the
// account. Nothing chosen means the dashboard as it comes; everything here
// is reversible with Reset.

export type DashboardSection = 'trends' | 'recent' | 'inTank' | 'growing' | 'live';

/** The parts a keeper can hide, with the words on the switch. */
export const DASHBOARD_SECTIONS: { key: DashboardSection; label: string; sub: string; planted?: boolean }[] = [
	{ key: 'trends', label: 'Trends', sub: 'The 4-week chart' },
	{ key: 'recent', label: 'Recent', sub: 'The last entries and photos' },
	{ key: 'inTank', label: 'In the tank', sub: 'Livestock, plants and equipment at a glance' },
	{ key: 'growing', label: 'Growing setup', sub: 'Light, CO₂, fertilizer and substrate under In the tank', planted: true },
	{ key: 'live', label: 'Live sensor readings', sub: 'A sensor’s latest value beside each parameter' }
];

export const MAX_PRIORITY = 3;

export interface DashboardChoices {
	/** Trends opens on this parameter; null for the automatic pick */
	trendParamId: string | null;
	/** parameter ids listed first, in this order */
	priority: string[];
	hidden: DashboardSection[];
}

export const DEFAULT_CHOICES: DashboardChoices = { trendParamId: null, priority: [], hidden: [] };

export const isSection = (v: unknown): v is DashboardSection => DASHBOARD_SECTIONS.some((s) => s.key === v);

/** True when anything differs from the defaults. */
export const customized = (c: DashboardChoices) => !!c.trendParamId || c.priority.length > 0 || c.hidden.length > 0;

/** The form's fields, checked against the tank's parameters: unknown ids and sections are dropped, the priority capped. */
export function parseChoices(form: FormData, paramIds: string[]): DashboardChoices {
	const trend = String(form.get('trend') ?? '');
	const priority: string[] = [];
	for (const v of form.getAll('priority').map(String)) {
		if (paramIds.includes(v) && !priority.includes(v) && priority.length < MAX_PRIORITY) priority.push(v);
	}
	// the form lists what to show; anything not ticked is hidden
	const shown = new Set(form.getAll('show').map(String));
	const hidden = DASHBOARD_SECTIONS.map((s) => s.key).filter((k) => !shown.has(k));
	return { trendParamId: paramIds.includes(trend) ? trend : null, priority, hidden };
}

/** The parameters with the prioritized ones first, in the chosen order, then the rest as they were. */
export function prioritize<T extends { id: string }>(params: T[], priority: string[]): T[] {
	if (!priority.length) return params;
	const first = priority.map((id) => params.find((p) => p.id === id)).filter((p): p is T => !!p);
	return [...first, ...params.filter((p) => !priority.includes(p.id))];
}
