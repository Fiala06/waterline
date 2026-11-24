// Pets' names stay private on public pages unless the owner turns on "Pet names
// and photos": an entry is shown as if its animals had none.

/**
 * An entry without its pets' names: a nickname and an old name go, and a
 * health entry's animals ("Zippy · Otocinclus") keep only their species
 * (#293: one helper for every public place).
 */
export const withoutPetNames = <E extends { data: Record<string, unknown> }>(e: E): E => ({
	...e,
	data: {
		...e.data,
		nickname: null,
		previous: null,
		...(Array.isArray(e.data.names) ? { names: (e.data.names as unknown[]).map((n) => String(n).split(' · ').at(-1)!) } : {})
	}
});

/**
 * An entry as a public page shows it: never the keeper's other tanks' names (a move
 * reads "to another tank", #343), and without pets' names unless `names` is on.
 */
export const publicEntry = <E extends { data: Record<string, unknown> }>(e: E, names: boolean): E => {
	const out = names ? e : withoutPetNames(e);
	return 'to_tank' in out.data || 'from_tank' in out.data ? { ...out, data: { ...out.data, to_tank: null, from_tank: null } } : out;
};
