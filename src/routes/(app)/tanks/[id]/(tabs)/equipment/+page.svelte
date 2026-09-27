<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	let { data } = $props();
	const base = $derived(`/tanks/${data.tankHead.id}`);
	// T2: "Last serviced Sep 3 · linked task: Clean canister filter"
	function meta(e: { serviced: string | null; task: string | null }) {
		const s = [e.serviced && `Last serviced ${e.serviced}`, e.task && `linked task: ${e.task}`].filter(Boolean).join(' · ');
		return s && s[0].toUpperCase() + s.slice(1);
	}
</script>

<svelte:head><title>Equipment · {data.tankHead.name}</title></svelte:head>

<!-- "+ Add" is in the tank header (layout) -->
<div class="body">
	{#if data.items.length}
		<div class="grid">
			{#each data.items as e (e.id)}
				<a class="card item" href="{base}/equipment/{e.id}">
					<div class="h"><span class="caps">{e.type}</span>{#if e.since}<span class="since">since {e.since}</span>{/if}</div>
					<div class="name">{e.name}</div>
					{#if e.summary.length}
						<div class="specs">{#each e.summary as s, i (i)}<span class="spec">{s}</span>{/each}</div>
					{/if}
					{#if meta(e)}<div class="meta">{meta(e)}</div>{/if}
				</a>
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
		>
			<a class="import-link" href="{base}/import/equipment">Import a list from a spreadsheet</a>
		</EmptyState>
	{/if}
	{#if data.past.length}
		<details class="past">
			<summary><span class="show">Show past equipment ({data.past.length})</span><span class="hide">Hide past equipment</span></summary>
			<ul class="card">
				{#each data.past as e (e.id)}<li><span>{e.name}</span><span class="muted">{e.type}</span></li>{/each}
			</ul>
		</details>
	{/if}
	{#if data.items.length}<a class="import-link" href="{base}/import/equipment">Import from a spreadsheet</a>{/if}
</div>

<style>
	.body {
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.grid {
		display: grid;
		gap: 10px;
	}
	.item {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		color: var(--text);
	}
	.item:hover {
		color: var(--text);
		border-color: var(--border-strong);
	}
	.h {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}
	.caps {
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.since {
		font-size: 12px;
		color: var(--text-faint);
		white-space: nowrap;
	}
	.name {
		font-size: 17px;
		font-weight: 600;
	}
	/* T2: specs as small tags */
	.specs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.spec {
		min-height: 26px;
		padding: 0 8px;
		border-radius: 6px;
		background: var(--surface-hi);
		display: inline-flex;
		align-items: center;
		font-size: 13px;
		color: var(--text-2);
	}
	.meta {
		font-size: 13px;
		color: var(--text-muted);
	}
	/* "Show past …" works the same on Equipment and Livestock */
	.past summary {
		list-style: none;
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-size: 14px;
		font-weight: 600;
		color: var(--accent);
		cursor: pointer;
	}
	.past summary::-webkit-details-marker {
		display: none;
	}
	.past[open] .show,
	.past:not([open]) .hide {
		display: none;
	}
	.past ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.past li {
		padding: 12px 14px;
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 15px;
	}
	.past li + li {
		border-top: 1px solid var(--border);
	}
	.past .muted {
		font-size: 13px;
	}
	@media (hover: hover) {
		.past summary:hover {
			color: var(--accent-hover);
		}
	}
	@media (min-width: 1024px) {
		.body {
			padding: 24px 32px;
			max-width: 1100px;
		}
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		}
	}
</style>
