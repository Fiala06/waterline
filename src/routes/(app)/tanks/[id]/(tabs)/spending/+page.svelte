<script lang="ts">
	import SortMenu from '$lib/components/SortMenu.svelte';
	// Spending (#7): this month, this year and all time, this year by category,
	// the last 12 months, and each expense (with its receipt, #8). The list's
	// filters (#314: category, dates, words) are a GET form, so they work without
	// JS; a category or month bar is a link that sets its part of them.
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ImportButton from '$lib/components/ImportButton.svelte';
	let { data } = $props();
	const base = $derived(`/tanks/${data.tankHead.id}`);
</script>

<svelte:head><title>Spending · {data.tankHead.name}</title></svelte:head>

<!-- "+ Add expense" is in the tank header (layout) -->
<div class="body">
	{#if !data.total}
		<EmptyState
			icon="maintenance"
			title="No spending logged yet"
			text="Your wallet says thanks… for now. Log what you spend on this tank: livestock, plants, equipment and consumables, with a receipt if you like."
			href="{base}/spending/new"
			label="Add expense"
			primary
		/>
	{:else}
		{#if data.allTanks}<p class="all">All your tanks this year: <strong class="num">{data.allTanks}</strong></p>{/if}
		<div class="tiles">
			<div class="tile"><span class="tl">This month</span><span class="tv num">{data.totals.month}</span></div>
			<div class="tile"><span class="tl">This year</span><span class="tv num">{data.totals.year}</span></div>
			<div class="tile"><span class="tl">All time</span><span class="tv num">{data.totals.all}</span></div>
		</div>

		<div class="cols">
			<section aria-labelledby="cat-h">
				<h2 id="cat-h" class="kicker rule">{data.year} by category</h2>
				{#if data.byCategory.length}
					<ul class="bars cats">
						{#each data.byCategory as c (c.key)}
							<li class:on={c.on}>
								<a href="{base}/spending{c.href}" aria-current={c.on ? 'true' : undefined} title="Show only {c.label}">
									<span class="bl">{c.label}</span>
									<span class="bar" aria-hidden="true"><i style:width="{Math.max(2, c.share * 100)}%"></i></span>
									<span class="bv num">{c.amount}</span>
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="none">Nothing yet this year.</p>
				{/if}
			</section>
			<section aria-labelledby="month-h">
				<h2 id="month-h" class="kicker rule">The last 12 months</h2>
				<ul class="bars months">
					{#each [...data.months].reverse() as m (m.key)}
						<li class:zero={!m.spent} class:on={m.on}>
							{#if m.spent}
								<a href="{base}/spending{m.href}" aria-current={m.on ? 'true' : undefined} title="Show only {m.label}">
									<span class="bl">{m.label}</span>
									<span class="bar" aria-hidden="true"><i style:width="{Math.max(2, m.share * 100)}%"></i></span>
									<span class="bv num">{m.amount}</span>
								</a>
							{:else}
								<span class="bl">{m.label}</span>
								<span class="bar" aria-hidden="true"></span>
								<span class="bv num">{m.amount}</span>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		</div>

		<section aria-labelledby="list-h">
			<h2 id="list-h" class="kicker rule">Expenses · {data.expenses.length}{data.filter.on ? ` of ${data.total}` : ''}</h2>
			<!-- the filters (#314), all at once; a bar above sets its part of them -->
			<form class="filters" method="GET" action="{base}/spending" role="search" aria-label="Expenses">
				<div class="f-q">
					<label class="label" for="sp-q">Search</label>
					<input class="input" id="sp-q" type="search" name="q" value={data.filter.q} placeholder="What for, a note, an item" autocomplete="off" enterkeyhint="search" maxlength="80" />
				</div>
				<div class="f-cat">
					<label class="label" for="sp-cat">Category</label>
					<select class="input" id="sp-cat" name="cat">
						<option value="" selected={!data.filter.cat}>All categories</option>
						{#each data.categories as c (c.key)}<option value={c.key} selected={data.filter.cat === c.key}>{c.label}</option>{/each}
					</select>
				</div>
				<div class="f-day">
					<label class="label" for="sp-from">From</label>
					<input class="input" id="sp-from" type="date" name="from" value={data.filter.from ?? ''} />
				</div>
				<div class="f-day">
					<label class="label" for="sp-to">To</label>
					<input class="input" id="sp-to" type="date" name="to" value={data.filter.to ?? ''} />
				</div>
				<button class="btn f-go">Show</button>
			</form>
			<p class="showing">
				{#if data.filter.on}
					<span>Showing {data.expenses.length} of {data.total} · <strong class="num">{data.shownTotal}</strong></span>
					<a href="{base}/spending">Clear filters</a>
				{/if}
				<a class="csv" href="{base}/spending.csv{data.filter.query}" download>Download CSV{data.filter.on ? ' of these' : ''}</a>
			</p>
			{#if data.expenses.length > 1}
				<SortMenu
					sort={data.sort}
					id="expense-sort"
					first="Newest first"
					options={[
						{ key: 'date', dir: 'asc', label: 'Oldest first' },
						{ key: 'amount', dir: 'desc', label: 'Most expensive' },
						{ key: 'amount', dir: 'asc', label: 'Least expensive' },
						{ key: 'category', dir: 'asc', label: 'Category' }
					]}
				/>
			{/if}
			{#if !data.expenses.length}
				<p class="none">No expenses match these filters. <a href="{base}/spending">Clear filters</a></p>
			{/if}
			<ul class="list">
				{#each data.expenses as e (e.id)}
					<li>
						<a href="{base}/spending/{e.id}">
							<span class="lt">
								<span class="lw">{e.what}</span>
								<span class="ls">{e.day} · {e.category}{e.item ? ` · ${e.item}` : ''}{e.receipt ? ` · ${e.receipt === 'application/pdf' ? 'PDF receipt' : 'Receipt'}` : ''}</span>
							</span>
							<span class="la num">{e.amount}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
	<!-- below the list, or below the empty box: in the same place on every tab -->
	<ImportButton href="{base}/import/spending" />
</div>

<style>
	.body {
		padding: 16px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 1080px;
	}
	section {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.rule {
		margin: 0;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
	}
	.all {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	.all strong {
		color: var(--text);
	}
	/* the headline numbers, side by side under a 2px rule with rules between them */
	.tiles {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border-top: 2px solid var(--ink);
	}
	.tile {
		padding: 14px 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.tile + .tile {
		border-left: 2px solid var(--divider);
	}
	.tile:first-child {
		padding-left: 0;
	}
	.tl {
		font-size: 12px;
		color: var(--text-muted);
	}
	.tv {
		font-size: 22px;
		font-weight: 800;
		line-height: 1.1;
		overflow-wrap: anywhere;
	}
	.cols {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	/* one series, labelled: the bar shows its size, the text says it */
	.bars {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
	}
	.bars li,
	.bars li a {
		display: grid;
		grid-template-columns: 110px minmax(0, 1fr) 80px;
		align-items: center;
		gap: 12px;
		font-size: 14px;
		color: var(--text);
	}
	.bars li {
		padding: 9px 0;
		border-bottom: 1px solid var(--divider);
	}
	/* the bar is the link: the row holds it, so the grid is the link's */
	.bars li:has(> a) {
		display: block;
	}
	.bars li a {
		min-height: 24px;
	}
	.bars li.on .bl {
		font-weight: 800;
	}
	@media (hover: hover) {
		.bars li a:hover .bl {
			color: var(--accent-text);
			text-decoration: underline;
			text-underline-offset: 3px;
		}
	}
	.filters {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px 12px;
		align-items: end;
		padding: 12px 0;
	}
	.filters > div {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.f-q,
	.f-cat {
		grid-column: 1 / -1;
	}
	.filters .input {
		width: 100%;
		height: 44px;
	}
	.f-go {
		min-height: 44px;
		justify-self: start;
	}
	@media (min-width: 1024px) {
		.filters {
			grid-template-columns: minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr) auto;
		}
		.f-q,
		.f-cat {
			grid-column: auto;
		}
	}
	.csv {
		margin-left: auto;
		font-weight: 700;
	}
	.showing {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 16px;
		min-height: 44px;
		font-size: 13px;
		color: var(--text-muted);
	}
	.showing strong {
		color: var(--text);
	}
	.showing a {
		font-weight: 800;
	}
	.bar {
		height: 10px;
		background: var(--neutral-200);
		display: flex;
	}
	.bar i {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	.bv {
		font-weight: 800;
		text-align: right;
	}
	.months li,
	.months li a {
		grid-template-columns: 70px minmax(0, 1fr) 80px;
		font-size: 13px;
	}
	.months li {
		padding: 4px 0;
		border-bottom: none;
	}
	.months .bar {
		height: 8px;
		background: transparent;
	}
	.months .bar i {
		background: var(--ink);
	}
	.months .bv {
		font-weight: 600;
	}
	.zero .bl,
	.zero .bv {
		color: var(--text-muted);
		font-weight: 400;
	}
	.none {
		margin: 0;
		padding: 10px 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.list a {
		min-height: 56px;
		padding: 10px 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	.lt {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.lw {
		font-size: 15px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.ls {
		font-size: 13px;
		color: var(--text-muted);
	}
	.la {
		flex-shrink: 0;
		font-size: 16px;
		font-weight: 800;
	}
	@media (hover: hover) {
		.list a:hover .lw {
			color: var(--accent-text);
		}
	}
	@media (min-width: 1024px) {
		.body {
			padding: 24px 32px 48px;
			gap: 28px;
		}
		.tile {
			padding: 14px 16px;
		}
		.tv {
			font-size: 32px;
		}
		.cols {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 32px;
			align-items: start;
		}
	}
</style>
