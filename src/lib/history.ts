// History filters (shared by the page and its loader).
export const FILTERS = [
	{ key: 'all', label: 'All' },
	{ key: 'test', label: 'Water tests', short: 'Tests' },
	{ key: 'water_change', label: 'Water changes' },
	{ key: 'dosing', label: 'Dosing' },
	{ key: 'feeding', label: 'Feeding' },
	{ key: 'maintenance', label: 'Maintenance' },
	{ key: 'livestock', label: 'Livestock / plants' },
	{ key: 'equipment', label: 'Equipment' },
	{ key: 'observation', label: 'Observations' },
	{ key: 'note', label: 'Notes & photos' }
] as const;

export const RANGES = [
	{ key: '7', label: 'Last 7 days' },
	{ key: '30', label: 'Last 30 days' },
	{ key: '90', label: 'Last 3 months' },
	{ key: '365', label: 'Last year' },
	{ key: 'all', label: 'All time' }
] as const;
