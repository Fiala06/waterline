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
