<script lang="ts">
	// Spending (#7): this month, this year and all time, this year by category,
	// the last 12 months, and each expense (with its receipt, #8).
	import EmptyState from '$lib/components/EmptyState.svelte';
	let { data } = $props();
	const base = $derived(`/tanks/${data.tankHead.id}`);
</script>

<svelte:head><title>Spending · {data.tankHead.name}</title></svelte:head>

<!-- "+ Add expense" is in the tank header (layout) -->
<div class="body">
	{#if !data.expenses.length}
		<EmptyState
			icon="maintenance"
			title="No spending logged yet"
			text="Log what you spend on this tank: livestock, plants, equipment and consumables, with a receipt if you like."
			href="{base}/spending/new"
			label="Add expense"
			primary
		/>
	{:else}
		<div class="tiles">
			<div class="card tile"><span class="tl">This month</span><span class="tv num">{data.totals.month}</span></div>
			<div class="card tile"><span class="tl">This year</span><span class="tv num">{data.totals.year}</span></div>
			<div class="card tile"><span class="tl">All time</span><span class="tv num">{data.totals.all}</span></div>
		</div>
		{#if data.allTanks}<p class="all">All your tanks this year: <strong class="num">{data.allTanks}</strong></p>{/if}

		<div class="cols">
			<section aria-labelledby="cat-h">
				<h2 id="cat-h">{data.year} by category</h2>
				{#if data.byCategory.length}
					<ul class="card bars">
						{#each data.byCategory as c (c.key)}
							<li>
								<span class="bl">{c.label}</span>
								<span class="bar" aria-hidden="true"><i style:width="{Math.max(2, c.share * 100)}%"></i></span>
								<span class="bv num">{c.amount}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="none">Nothing yet this year.</p>
				{/if}
			</section>
			<section aria-labelledby="month-h">
				<h2 id="month-h">The last 12 months</h2>
				<ul class="card bars months">
					{#each [...data.months].reverse() as m (m.key)}
						<li class:zero={!m.cents}>
							<span class="bl">{m.label}</span>
							<span class="bar" aria-hidden="true"><i style:width="{m.cents ? Math.max(2, m.share * 100) : 0}%"></i></span>
							<span class="bv num">{m.amount}</span>
						</li>
					{/each}
				</ul>
			</section>
		</div>

		<section aria-labelledby="list-h">
			<h2 id="list-h">Expenses</h2>
			<ul class="card list">
				{#each data.expenses as e (e.id)}
					<li>
						<a href="{base}/spending/{e.id}">
							<span class="lt">
								<span class="lw">{e.what}</span>
								<span class="ls">{e.day} · {e.category}{e.receipt ? ` · ${e.receipt === 'application/pdf' ? 'PDF receipt' : 'Receipt'}` : ''}</span>
							</span>
							<span class="la num">{e.amount}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.body {
		padding: 12px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	/* the headline numbers */
	.tiles {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	.tile {
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.tl {
		font-size: 12px;
		color: var(--text-muted);
	}
	.tv {
		font-size: 20px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.all {
		margin: -8px 0 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.all strong {
		color: var(--text);
	}
	.cols {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	/* one series, labelled: the bar shows its size, the text says it */
	.bars {
		margin: 0;
		padding: 10px 14px;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.bars li {
		display: grid;
		grid-template-columns: 92px minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		font-size: 14px;
	}
	.bl {
		color: var(--text-2);
	}
	.bar {
		height: 8px;
		border-radius: 4px;
		background: var(--divider-soft);
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		border-radius: 4px;
		background: var(--accent);
	}
	.bv {
		font-weight: 600;
		text-align: right;
	}
	.zero .bl,
	.zero .bv {
		color: var(--text-faint);
		font-weight: 400;
	}
	.none {
		margin: 0;
		font-size: 14px;
		color: var(--text-faint);
	}
	.list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.list li + li {
		border-top: 1px solid var(--border);
	}
	.list a {
		min-height: 56px;
		padding: 10px 14px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		color: var(--text);
	}
	.lt {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.lw {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.ls {
		font-size: 13px;
		color: var(--text-muted);
	}
	.la {
		flex-shrink: 0;
		font-weight: 700;
	}
	@media (min-width: 1024px) {
		.body {
			padding: 20px 24px 32px;
			max-width: 980px;
		}
		.cols {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 24px;
			align-items: start;
		}
		.tv {
			font-size: 24px;
		}
	}
</style>
