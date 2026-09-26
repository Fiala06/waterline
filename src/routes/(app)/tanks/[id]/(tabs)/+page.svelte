<script lang="ts">
	let { data } = $props();
	const base = $derived(`/tanks/${data.tankHead.id}`);
</script>

<svelte:head><title>{data.tankHead.name} · Waterline</title></svelte:head>

<div class="body">
	<div class="col">
		<section>
			<div class="sh"><h2 class="caps">Specs</h2><a href="{base}/settings">Edit ›</a></div>
			{#if data.specs.length}
				<div class="card rows">
					{#each data.specs as [k, v] (k)}<div class="row"><span class="k">{k}</span><span class="v">{v}</span></div>{/each}
				</div>
			{:else}
				<a class="card empty" href="{base}/settings">Add the tank model, glass, substrate and light hours in Settings.</a>
			{/if}
			{#if data.notes}<p class="notes">{data.notes}</p>{/if}
		</section>
	</div>
	<div class="col">
		<section>
			<div class="sh"><h2 class="caps">Equipment · {data.equipment.length}</h2><a href="{base}/equipment">All ›</a></div>
			{#if data.equipment.length}
				<div class="card rows">
					{#each data.equipment as e (e.id)}<div class="row"><span class="k">{e.type}</span><span class="v">{e.name}</span></div>{/each}
				</div>
			{:else}
				<a class="card empty" href="{base}/equipment/new">+ Add equipment</a>
			{/if}
		</section>

		<section>
			<div class="sh">
				<h2 class="caps">Livestock · {data.animals} in {data.livestock.length} species</h2>
				<a href="{base}/livestock">All ›</a>
			</div>
			{#if data.livestock.length}
				<div class="card rows">
					{#each data.livestock as l (l.id)}
						<div class="row"><span class="v">{l.name}{#if l.quarantine} <span class="status-warn sm">▲ Quarantine</span>{/if}</span><span class="num strong">{l.count}</span></div>
					{/each}
				</div>
			{:else}
				<a class="card empty" href="{base}/livestock/new">+ Add livestock</a>
			{/if}
		</section>

		<section>
			<div class="sh"><h2 class="caps">Plants · {data.plants.length}</h2><a href="{base}/plants">All ›</a></div>
			{#if data.plants.length}
				<p class="card plants">{data.plants.join(', ')}</p>
			{:else}
				<a class="card empty" href="{base}/plants">+ Add plants</a>
			{/if}
		</section>
	</div>
</div>

<style>
	.body {
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.sh {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.caps {
		margin: 0;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.sh a {
		font-size: 14px;
		font-weight: 600;
	}
	.rows {
		display: flex;
		flex-direction: column;
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 14px;
		font-size: 15px;
	}
	.row + .row {
		border-top: 1px solid var(--border);
	}
	.k {
		color: var(--text-muted);
	}
	.v {
		font-weight: 600;
		text-align: right;
	}
	.row .v:first-child {
		text-align: left;
	}
	.strong {
		font-weight: 700;
	}
	.sm {
		font-size: 12px;
	}
	.empty {
		padding: 16px;
		color: var(--accent);
		font-weight: 600;
		border-style: dashed;
		font-size: 15px;
	}
	.plants {
		margin: 0;
		padding: 14px;
		line-height: 1.6;
	}
	.notes {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
		white-space: pre-wrap;
	}
	@media (min-width: 1024px) {
		.body {
			padding: 24px 32px;
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 28px;
			align-items: start;
			max-width: 1100px;
		}
	}
</style>
