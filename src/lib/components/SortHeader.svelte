<script lang="ts">
	// A sortable column header (#79): a link that sorts by its column, or turns
	// the order round when it already does, with ▲ / ▼ for the direction. The
	// sort is in the address, so it works without scripts.
	import { page } from '$app/state';
	import { ariaSort, sortHref, type SortChoice, type SortDir } from '$lib/sort';

	let {
		key,
		label,
		sort,
		first = 'asc',
		class: cls = ''
	}: {
		key: string;
		label: string;
		sort: SortChoice | null;
		/** the order a first tap gives: newest first for dates, most first for counts */
		first?: SortDir;
		class?: string;
	} = $props();
	const on = $derived(sort?.key === key);
</script>

<span role="columnheader" class={cls} aria-sort={ariaSort(key, sort)}
	><a class="sort" class:on href={sortHref(page.url, key, sort, first)} data-sveltekit-noscroll data-sveltekit-replacestate
		>{label}<span class="arrow" aria-hidden="true">{on ? (sort?.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span><span class="sr-only"
			>{on ? `, sorted ${sort?.dir === 'asc' ? 'ascending' : 'descending'}` : ', sort by this'}</span
		></a
	></span
>

<style>
	.sort {
		color: inherit;
		text-decoration: none;
	}
	.sort.on {
		color: var(--text);
	}
	@media (hover: hover) {
		.sort:hover {
			color: var(--accent-text);
		}
	}
	.arrow {
		font-size: 0.85em;
	}
</style>
