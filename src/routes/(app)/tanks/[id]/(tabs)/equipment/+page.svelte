<script lang="ts">
	// Equipment (README → Screens §7): cards with a 2px ink top rule, the type as a
	// kicker, the name, spec tags, a meta line and Log service / Details.
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ImportButton from '$lib/components/ImportButton.svelte';
	let { data } = $props();
	const base = $derived(`/tanks/${data.tankHead.id}`);
	// T2: "Last serviced Sep 3 · linked task: Clean canister filter"
	function meta(e: { serviced: string | null; task: string | null }) {
		const s = [e.serviced && `Last serviced ${e.serviced}`, e.task && `linked task: ${e.task}`].filter(Boolean).join(' · ');
		return s && s[0].toUpperCase() + s.slice(1);
	}
	// a maintenance entry for this tank: the form has the equipment picker
	const serviceHref = $derived(`/entries/event/new?tank=${data.tankHead.id}&category=maintenance&from=${encodeURIComponent(`${base}/equipment`)}`);
</script>

<svelte:head><title>Equipment · {data.tankHead.name}</title></svelte:head>

<!-- "+ Add equipment" and "4 items" are in the tab's toolbar (layout) -->
<div class="body">
	{#if data.items.length}
		<div class="grid">
			{#each data.items as e (e.id)}
				<article class="card eq-card">
					<div class="h"><span class="kicker type">{e.type}</span>{#if e.since}<span class="since">since {e.since}</span>{/if}</div>
					<a class="name item" href="{base}/equipment/{e.id}">{e.name}<span class="chev" aria-hidden="true">›</span></a>
					{#if e.summary.length}
						<div class="specs">{#each e.summary as s, i (i)}<span class="tag tag-neutral">{s}</span>{/each}</div>
					{/if}
					{#if e.service}<div class="service status-{e.service.level}">{e.service.text}</div>{/if}
					{#if meta(e)}<div class="meta">{meta(e)}</div>{/if}
					<div class="acts">
						<a class="ghost" href={serviceHref}>Log service</a>
						<a class="ghost muted-link" href="{base}/equipment/{e.id}">Details</a>
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<EmptyState
			icon="equipment"
			title="No equipment yet"
			text="Add filters, heaters, lights and more to keep settings and service dates in one place."
			href="{base}/equipment/new"
			label="Add equipment"
			primary
		/>
	{/if}
	{#if data.past.length}
		<details class="past">
			<summary><span class="show">Show past equipment ({data.past.length})</span><span class="hide">Hide past equipment</span></summary>
			<div class="past-list">
				<span class="kicker">Past equipment</span>
				{#each data.past as e (e.id)}
					<div class="past-row"><a href="{base}/equipment/{e.id}">{e.name}</a><span class="muted">{e.type}{e.since ? ` · since ${e.since}` : ''}</span></div>
				{/each}
			</div>
		</details>
	{/if}
	<!-- below the list, or below the empty box: in the same place on every tab -->
	<ImportButton href="{base}/import/equipment" />
</div>

<style>
	.body {
		padding: 16px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.grid {
		display: grid;
		gap: 24px;
	}
	.eq-card {
		padding: 12px 0 4px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		color: var(--text);
	}
	.h {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}
	.type {
		font-weight: 800;
	}
	.since {
		font-size: 12px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.name {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: 20px;
		font-weight: 800;
		line-height: 1.2;
		color: var(--text);
		letter-spacing: -0.015em;
	}
	.name:hover {
		color: var(--accent-text);
	}
	.chev {
		font-size: 16px;
		font-weight: 400;
		color: var(--neutral-600);
	}
	.specs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.specs .tag {
		font-size: 12px;
	}
	.meta {
		font-size: 13px;
		color: var(--text-2);
	}
	.service {
		font-size: 13px;
		font-weight: 800;
	}
	.service + .meta {
		margin-top: -6px;
	}
	.acts {
		display: flex;
		gap: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--divider);
	}
	.ghost {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin: -6px 0;
		padding: 0 4px;
		font-size: 14px;
		font-weight: 800;
		color: var(--accent-text);
	}
	.muted-link {
		color: var(--text-muted);
	}
	/* "Show past …" works the same on Equipment and Livestock */
	.past {
		display: flex;
		flex-direction: column;
		border-top: 2px solid var(--divider);
	}
	.past summary {
		list-style: none;
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 4px;
		font-size: 14px;
		font-weight: 800;
		color: var(--accent-text);
		cursor: pointer;
	}
	.past summary::-webkit-details-marker {
		display: none;
	}
	.past[open] .show,
	.past:not([open]) .hide {
		display: none;
	}
	.past-list {
		display: flex;
		flex-direction: column;
	}
	.past-list .kicker {
		padding: 4px 0 6px;
	}
	.past-row {
		padding: 8px 0;
		display: flex;
		justify-content: space-between;
		gap: 12px;
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
	}
	.past-row a {
		color: var(--text);
		font-weight: 600;
	}
	.past .muted {
		font-size: 13px;
		white-space: nowrap;
	}
	@media (hover: hover) {
		.ghost:hover,
		.past summary:hover {
			background: color-mix(in srgb, var(--accent) 10%, transparent);
			color: var(--accent-text);
		}
		.past-row a:hover {
			color: var(--accent-text);
		}
	}
	@media (min-width: 1024px) {
		.body {
			padding: 24px 32px 48px;
		}
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		}
	}
</style>
