// Time ranges on the Charts screen.
export const CHART_RANGES = [
	{ key: '2w', label: '2W', days: 14 },
	{ key: '1m', label: '1M', days: 30 },
	{ key: '3m', label: '3M', days: 91 },
	{ key: '1y', label: '1Y', days: 365 },
	{ key: 'all', label: 'All', days: 0 }
] as const;
