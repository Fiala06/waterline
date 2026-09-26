<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import { FILTERS, RANGES } from '$lib/history';
	import { photoUrl } from '$lib/media';
	import { ui } from '$lib/ui.svelte';
	import type { ComponentProps } from 'svelte';

	let { data } = $props();

	const q = (patch: Record<string, string | null>) => {
		const u = new URLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(patch)) (v == null ? u.delete(k) : u.set(k, v));
		const s = u.toString();
		return `/history${s ? `?${s}` : ''}`;
	};

	// Desktop opens entries in the right pane; phones go to the entry page.
	function open(e: MouseEvent, key: string) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || !matchMedia('(min-width: 1024px)').matches) return;
		e.preventDefault();
		goto(q({ entry: key }), { noScroll: true, keepFocus: true, replaceState: true });
	}
	const count = (key: string) => data.counts?.[key] ?? 0;
	const kind = (icon: string) => icon as ComponentProps<typeof CategoryIcon>['kind'];
</script>

<svelte:head><title>History · Waterline</title></svelte:head>

<div class="page">
	<a class="back" href="/">‹ Dashboard</a>
	<div class="head">
		<h1>History</h1>
		{#if data.tank}<button type="button" class="tank" onclick={() => (ui.tankSwitcher = true)}>{data.tank.name} ▾</button>{/if}
	</div>

	{#if !data.tank}
		<div class="card empty"><strong>No tanks yet</strong><a href="/tanks/new">Add tank</a></div>
	{:else}
		<div class="layout">
			<nav class="filters" aria-label="Category">
				<div class="caps">Category</div>
				{#each FILTERS as f (f.key)}
					<a
						class="filter"
						class:active={data.cat === f.key}
						aria-current={data.cat === f.key ? 'true' : undefined}
						href={q({ cat: f.key === 'all' ? null : f.key, entry: null })}
					>
						<span class="f-label">{'short' in f ? f.short : f.label}</span><span class="f-long">{f.label}</span>
						<span class="f-count">{count(f.key)}</span>
					</a>
				{/each}
			</nav>

			<div class="list">
				<form class="range" method="GET" action="/history">
					{#if data.cat !== 'all'}<input type="hidden" name="cat" value={data.cat} />{/if}
					<label>
						<span class="sr-only">Date range</span>
						<select name="range" value={data.range} onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}>
							{#each RANGES as r (r.key)}<option value={r.key} selected={r.key === data.range}>{r.label}</option>{/each}
						</select>
					</label>
					<noscript><button class="btn">Apply</button></noscript>
					<span class="muted">{data.total} entr{data.total === 1 ? 'y' : 'ies'}</span>
				</form>

				{#if !data.groups?.length}
					<div class="card empty">
						<strong>Nothing logged here yet</strong>
						<span class="muted">Try a longer date range or another category.</span>
					</div>
				{/if}

				{#each data.groups ?? [] as g (g.day)}
					<section>
						<h2 class="day">{g.label}</h2>
						<div class="card group">
							{#each g.items as it (it.key)}
								<a class="row" class:selected={data.selected === it.key} href={it.href} onclick={(e) => open(e, it.key)}>
									<CategoryIcon kind={kind(it.icon)} size={40} />
									<span class="text">
										<span class="title">{it.title}</span>
										<span class="sub">{it.sub}{#if it.bad} · <span class="status-bad strong">{it.bad}</span>{/if}</span>
									</span>
									{#if it.thumb}
										<img class="thumb" src={photoUrl(it.thumb)} alt="" loading="lazy" />
									{:else}
										<span class="chev" aria-hidden="true">›</span>
									{/if}
								</a>
							{/each}
						</div>
					</section>
				{/each}
			</div>

			<aside class="detail" aria-label="Entry detail">
				{#if data.detail}
					{@const d = data.detail}
					<div class="card pane">
						<div>
							<h2 class="d-title">{d.title}</h2>
							<div class="muted sm">{d.when} · {data.tank.name}{d.edited ? ` · edited ${d.edited}` : ''}</div>
						</div>
						{#if d.rows.length}
							<div class="rows">
								{#each d.rows as r, i (i)}
									<div class="drow">
										<span class="dl">{r.label}</span>
										<span class="dv num">{r.value}</span>
										{#if r.statusText}<span class="ds status-{r.level}">{r.statusText}</span>{/if}
									</div>
								{/each}
							</div>
						{/if}
						{#if d.note}<p class="note">{d.note}</p>{/if}
						{#if d.photos.length}
							<div class="photos">
								{#each d.photos as p (p.id)}<a href="/photos/{p.id}"><img src={photoUrl(p.id)} alt="" loading="lazy" /></a>{/each}
							</div>
						{/if}
						<div class="actions">
							{#if d.editable}<a class="btn grow" href="{d.href}/edit">Edit</a>{/if}
							<ConfirmDelete
								id="confirm-history-delete"
								title="Delete this {d.kindLabel.toLowerCase()}?"
								body="“{d.title}” from {d.day} will be removed. This can't be undone."
								action="{d.href}?/delete"
							/>
						</div>
					</div>
				{/if}
			</aside>
		</div>
	{/if}
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.back {
		font-size: 16px;
		font-weight: 600;
		min-height: 36px;
		display: flex;
		align-items: center;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	.tank {
		font-size: 14px;
		color: var(--text-muted);
		min-height: 44px;
	}
	.filters {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		scrollbar-width: none;
		margin: 0 -20px;
		padding: 0 20px 4px;
	}
	.filters .caps,
	.f-long,
	.f-count {
		display: none;
	}
	.filter {
		display: inline-flex;
		align-items: center;
		height: 36px;
		padding: 0 14px;
		border-radius: 18px;
		border: 1px solid var(--border-strong);
		font-size: 14px;
		color: var(--text);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.filter.active {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
		font-weight: 700;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
	}
	.range {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 13px;
	}
	.range select {
		background: transparent;
		border: none;
		color: var(--text-muted);
		font-size: 13px;
		min-height: 36px;
		padding: 0;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.day {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-muted);
		letter-spacing: 0.04em;
	}
	.group {
		border-radius: 14px;
		overflow: hidden;
	}
	.row {
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 12px;
		color: var(--text);
	}
	.row + .row {
		border-top: 1px solid var(--border);
	}
	.row:hover {
		background: var(--surface-hi);
	}
	.row.selected {
		background: var(--selected);
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.title {
		font-size: 15px;
		font-weight: 600;
	}
	.sub {
		font-size: 13px;
		color: var(--text-muted);
	}
	.strong {
		font-weight: 600;
	}
	.thumb {
		width: 44px;
		height: 44px;
		border-radius: 8px;
		object-fit: cover;
		flex-shrink: 0;
	}
	.chev {
		color: var(--placeholder);
		font-size: 18px;
	}
	.empty {
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.detail {
		display: none;
	}
	.sm {
		font-size: 13px;
	}

	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
		}
		.back,
		.tank {
			display: none;
		}
		.layout {
			display: grid;
			grid-template-columns: 220px minmax(0, 1fr) 380px;
			gap: 24px;
			align-items: start;
		}
		.filters {
			flex-direction: column;
			gap: 2px;
			margin: 0;
			padding: 0;
			overflow: visible;
		}
		.filters .caps {
			display: block;
			font-size: 12px;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--text-faint);
			padding: 0 12px 6px;
		}
		.filter {
			height: 40px;
			border: none;
			border-radius: 10px;
			justify-content: space-between;
			color: var(--text-2);
			font-size: 15px;
		}
		.filter:hover {
			background: var(--surface);
		}
		.filter.active {
			background: var(--selected);
			color: var(--accent);
			font-weight: 600;
		}
		.f-label {
			display: none;
		}
		.f-long,
		.f-count {
			display: inline;
		}
		.f-count {
			font-size: 13px;
			color: var(--text-faint);
		}
		.detail {
			display: block;
			position: sticky;
			top: 24px;
		}
		.pane {
			padding: 20px;
			display: flex;
			flex-direction: column;
			gap: 16px;
		}
		.d-title {
			margin: 0 0 4px;
			font-size: 20px;
			font-weight: 600;
		}
		.rows {
			border-radius: 14px;
			background: var(--surface-2);
			border: 1px solid var(--border);
		}
		.drow {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 10px 12px;
		}
		.drow + .drow {
			border-top: 1px solid var(--border);
		}
		.dl {
			flex: 1;
			color: var(--text-muted);
			font-size: 14px;
		}
		.dv {
			font-weight: 600;
		}
		.ds {
			width: 96px;
			text-align: right;
			font-size: 13px;
			font-weight: 600;
		}
		.note {
			margin: 0;
			line-height: 1.5;
			white-space: pre-wrap;
		}
		.photos {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 6px;
		}
		.photos img {
			width: 100%;
			aspect-ratio: 1;
			object-fit: cover;
			border-radius: 8px;
			display: block;
		}
		.actions {
			display: flex;
			gap: 10px;
		}
		.grow {
			flex: 1;
		}
	}
</style>
