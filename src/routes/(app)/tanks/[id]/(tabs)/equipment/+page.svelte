<script lang="ts">
	let { data } = $props();
	const base = $derived(`/tanks/${data.tankHead.id}`);
</script>

<svelte:head><title>Equipment · {data.tankHead.name}</title></svelte:head>

<div class="body">
	<div class="top"><a class="btn add" href="{base}/equipment/new">+ Add</a></div>
	{#if !data.items.length}
		<div class="card empty">
			<strong>No equipment yet</strong>
			<span class="muted">Add filters, heaters, lights and more to keep settings and service dates in one place.</span>
			<a class="btn btn-primary" href="{base}/equipment/new">Add equipment</a>
		</div>
	{/if}
	<div class="grid">
		{#each data.items as e (e.id)}
			<a class="card item" href="{base}/equipment/{e.id}">
				<div class="h"><span class="caps">{e.type}</span>{#if e.since}<span class="muted sm">since {e.since}</span>{/if}</div>
				<div class="name">{e.name}</div>
				{#each e.summary as line, i (i)}<div class="spec">{line}</div>{/each}
				{#if e.serviced || e.task}
					<div class="muted sm">{e.serviced ? `Last serviced ${e.serviced}` : ''}{e.serviced && e.task ? ' · ' : ''}{e.task ? `linked task: ${e.task}` : ''}</div>
				{/if}
			</a>
		{/each}
	</div>
	{#if data.past.length}
		<details>
			<summary>Past equipment · {data.past.length}</summary>
			<ul class="card past">
				{#each data.past as e (e.id)}<li><span>{e.name}</span><span class="muted sm">{e.type}</span></li>{/each}
			</ul>
		</details>
	{/if}
</div>

<style>
	.body {
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.top {
		display: flex;
		justify-content: flex-end;
	}
	.add {
		min-height: 38px;
	}
	.grid {
		display: grid;
		gap: 10px;
	}
	.item {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		color: var(--text);
	}
	.item:hover {
		border-color: var(--border-strong);
	}
	.h {
		display: flex;
		justify-content: space-between;
	}
	.caps {
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.name {
		font-size: 17px;
		font-weight: 600;
	}
	.spec {
		font-size: 14px;
		color: var(--text-2);
	}
	.sm {
		font-size: 13px;
	}
	.empty {
		padding: 18px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	details summary {
		cursor: pointer;
		color: var(--text-muted);
		padding: 10px 0;
	}
	.past {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.past li {
		padding: 12px 14px;
		display: flex;
		justify-content: space-between;
	}
	.past li + li {
		border-top: 1px solid var(--border);
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
