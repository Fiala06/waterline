// The sample tank (#301): what /sample adds to the public tank page.
export interface SampleExtras {
	/** the made-up tank's spending: its total, by category, the latest purchases */
	spending: { total: string; byCategory: { label: string; amount: string }[]; recent: { what: string; date: string; amount: string }[] };
	/** the admin's line on who can join, from the product homepage's settings */
	access: string | null;
	/** where running your own Waterline is explained */
	repo: string;
}
