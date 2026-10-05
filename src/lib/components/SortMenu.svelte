<script lang="ts">
	// "Sort by" (#79) for a list without column headers, and for a table on a
	// phone, where its headers are hidden: a select that sorts as soon as it
	// changes, or with its Sort button when scripts are off. The list's own
	// order is the first choice.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { SortChoice, SortDir } from '$lib/sort';

	let {
		options,
		sort,
		label = 'Sort by',
		first = 'Default order',
		id = 'sort-by',
		class: cls = ''
	}: {
		options: { key: string; dir: SortDir; label: string }[];
		sort: SortChoice | null;
		label?: string;
		/** what the list's own order is called: "Newest first" */
		first?: string;
		id?: string;
		class?: string;
	} = $props();
	const value = $derived(sort ? `${sort.key}:${sort.dir}` : '');
	// everything else in the address (a filter, the tank) rides along
	const keep = $derived([...page.url.searchParams].filter(([k]) => k !== 'sort' && k !== 'dir'));
	function change(e: Event) {
		const v = (e.currentTarget as HTMLSelectElement).value;
		const q = new URLSearchParams(keep);
		if (v) {
			const [k, d] = v.split(':');
			q.set('sort', k);
			q.set('dir', d);
		}
		const qs = q.toString();
		goto(qs ? `?${qs}` : page.url.pathname, { noScroll: true, replaceState: true, keepFocus: true });
	}
</script>

<form method="GET" class="sort-menu {cls}">
	{#each keep as [k, v] (k)}<input type="hidden" name={k} value={v} />{/each}
	<label for={id}>{label}</label>
	<select class="input" {id} name="sort" {value} onchange={change}>
		<option value="">{first}</option>
		{#each options as o (`${o.key}:${o.dir}`)}<option value="{o.key}:{o.dir}">{o.label}</option>{/each}
	</select>
	<noscript><button class="btn">Sort</button></noscript>
</form>

<style>
	.sort-menu {
		margin-bottom: 8px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--text-muted);
	}
	label {
		white-space: nowrap;
	}
	select {
		width: auto;
		min-height: 44px;
		padding-right: 32px;
		font-size: 14px;
	}
</style>
