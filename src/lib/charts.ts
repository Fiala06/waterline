// Time ranges on the Charts screen: the short label for the picker on phones, the long one on desktop.
export const CHART_RANGES = [
	{ key: '2w', label: '2W', long: '2 weeks', days: 14 },
	{ key: '1m', label: '1M', long: '30 days', days: 30 },
	{ key: '3m', label: '3M', long: '90 days', days: 91 },
	{ key: '1y', label: '1Y', long: '1 year', days: 365 },
	{ key: 'all', label: 'All', long: 'All', days: 0 }
] as const;
