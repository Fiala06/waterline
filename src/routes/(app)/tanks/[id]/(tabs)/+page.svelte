<script lang="ts">
	// Notes & routines (Setup): Specs, Notes and Routines (TankDetailsSections,
	// shared with the end of Setup › Details) beside Equipment, Livestock and
	// Plants, each a section head over a 2px ink rule with rows divided by 1px
	// lines (the redesign's section pattern). The shell shows the cover and name.
	import EmptyState from '$lib/components/EmptyState.svelte';
	import TankDetailsSections from '$lib/components/TankDetailsSections.svelte';
	let { data } = $props();
	const base = $derived(`/tanks/${data.tankHead.id}`);
</script>

<svelte:head><title>Notes & routines · {data.tankHead.name}</title></svelte:head>

<div class="body">
	<div class="col">
		<TankDetailsSections tankId={data.tankHead.id} tankName={data.tankHead.name} details={data} editHref="{base}/settings#specBrand" />
	</div>
	<div class="col side">
		<section>
			<div class="section-head">
				<h2>Equipment{data.equipment.length ? ` · ${data.equipment.length}` : ''}</h2>
				{#if data.equipment.length}<a href="{base}/equipment">All ›</a>{/if}
			</div>
			{#if data.equipment.length}
				<div class="list">
					{#each data.equipment as e (e.id)}
						<a class="eq" href="{base}/equipment/{e.id}"><span class="k">{e.type}</span><span class="v">{e.name}</span></a>
					{/each}
				</div>
			{:else}
				<EmptyState compact icon="equipment" title="None added yet" href="{base}/equipment/new" label="Add equipment" />
			{/if}
		</section>

		<section>
			<div class="section-head">
				<h2>Livestock{data.livestock.length ? ` · ${data.animals} in ${data.species} species` : ''}</h2>
				{#if data.livestock.length}<a href="{base}/livestock">All ›</a>{/if}
			</div>
			{#if data.livestock.length}
				<ul class="list stock">
					{#each data.livestock as l (l.id)}
						<li>
							<span class="s-name">{l.name}</span>
							{#if l.quarantine}<span class="status-tag tag-warn sm">▲ Quarantine</span>{/if}
							<span class="count">{l.count}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<EmptyState compact icon="livestock" title="None added yet" href="{base}/livestock/new" label="Add livestock" />
			{/if}
		</section>

		<section>
			<div class="section-head">
				<h2>Plants{data.plants.length ? ` · ${data.plants.length}` : ''}</h2>
				{#if data.plants.length}<a href="{base}/plants">All ›</a>{/if}
			</div>
			{#if data.plants.length}
				<p class="plants">{data.plants.join(', ')}</p>
			{:else}
				<EmptyState compact icon="plant" title="None added yet" href="{base}/plants" label="Add plants" />
			{/if}
		</section>

		<section>
			<div class="section-head"><h2>Get help</h2></div>
			<a class="ai" href="{base}/summary">
				<span class="ai-text">
					<span class="ai-t">Copy a summary of this tank</span>
					<span class="ai-s">Its readings, care log and stocking as text, for a forum post, a friend, your fish store or an AI chat.</span>
				</span>
				<span class="chev" aria-hidden="true">›</span>
			</a>
		</section>
	</div>
</div>

<style>
	.body {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
	}
	.col {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	section {
		display: flex;
		flex-direction: column;
		padding: 18px 0 10px;
	}
	/* the "Get help" row */
	.ai {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 0;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	.ai-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.ai-t {
		font-size: 15px;
		font-weight: 700;
	}
	.ai-s {
		font-size: 13px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.chev {
		font-size: 20px;
		color: var(--text-muted);
	}
	@media (hover: hover) {
		.ai:hover,
		.eq:hover {
			background: var(--surface);
			box-shadow: -8px 0 0 var(--surface);
			color: var(--text);
		}
	}
	.list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
	}
	.eq {
		min-height: 48px;
		padding: 10px 0;
		display: flex;
		align-items: center;
		gap: 12px;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	.k {
		width: 72px;
		flex-shrink: 0;
		font-size: 12px;
		color: var(--text-muted);
	}
	.v {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		font-weight: 700;
	}
	/* livestock rows: the name, the count at the end */
	.stock li {
		min-height: 44px;
		padding: 8px 0;
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 15px;
		border-bottom: 1px solid var(--divider);
	}
	.s-name {
		flex: 1;
		min-width: 0;
	}
	.count {
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.plants {
		margin: 12px 0 0;
		font-size: 15px;
		line-height: 1.6;
		color: var(--text-2);
	}
	@media (min-width: 1024px) {
		.body {
			padding: 0 32px 32px;
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			align-items: start;
			max-width: 1100px;
		}
		section {
			padding: 24px 0 16px;
		}
		/* the second column sits past a 2px rule */
		.col:first-child {
			padding-right: 28px;
			border-right: 2px solid var(--divider);
			align-self: stretch;
		}
		.col.side {
			padding-left: 28px;
		}
	}
</style>
