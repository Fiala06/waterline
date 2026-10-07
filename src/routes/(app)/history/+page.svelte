<script lang="ts">
	import WorthChecking from '$lib/components/WorthChecking.svelte';
	// History (README → Screens §4): categories with counts, the list grouped
	// by day, and on desktop a detail pane with the entry's rows, note, photos
	// and Edit / Delete. Phones get chips and open entries on their own page.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { hscroll } from '$lib/actions';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import CopyReadings from '$lib/components/CopyReadings.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ImportButton from '$lib/components/ImportButton.svelte';
	import { FILTERS, RANGES } from '$lib/history';
	import { IMPORTS, importForFilter } from '$lib/imports';
	import { photoUrl } from '$lib/media';
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
	type Kind = ComponentProps<typeof CategoryIcon>['kind'];
	const kind = (icon: string) => icon as Kind;
	// The empty list shows the icon of the category picked.
	const emptyIcon = $derived((data.cat === 'all' ? 'note' : data.cat) as Kind);
	// Past entries from a spreadsheet: the import for the category picked (water tests for All)
	const importKind = $derived(importForFilter(data.cat ?? 'all'));
	const importHref = $derived(data.tank ? `/tanks/${data.tank.id}/import/${IMPORTS[importKind].slug}` : null);
	const emptyText = $derived(
		data.cat === 'all' ? 'Tests, water changes, dosing and notes you log for this tank show up here.' : 'Try All, or log something in this category.'
	);

	// the selects submit as they change; with scripts the category keeps the URL clean (no cat=all)
	const submit = (e: Event) => (e.currentTarget as HTMLSelectElement).form?.requestSubmit();
	function pickCat(e: Event) {
		const v = (e.currentTarget as HTMLSelectElement).value;
		goto(q({ cat: v === 'all' ? null : v, entry: null }), { noScroll: true });
	}

	// A note's first line is already its title: don't repeat it as the body.
	function noteBody(note: string | null, title: string) {
		const text = note?.trim();
		if (!text || text === title) return null;
		const [first, ...rest] = text.split('\n');
		return first.trim() === title ? rest.join('\n').trim() || null : text;
	}
	// 7.10 · the confirm copy (the entry pages use the same strings)
	function confirmCopy(d: NonNullable<typeof data.detail>) {
		if (d.kind === 'test') {
			const n = d.rows.length;
			return {
				title: 'Delete this water test?',
				body: `${n ? `The ${n} reading${n === 1 ? '' : 's'}` : 'The water test'} from ${d.day} will be removed. This can't be undone.`
			};
		}
		return { title: 'Delete this entry?', body: `“${d.title}” from ${d.day} will be removed. This can't be undone.` };
	}
</script>

<svelte:head><title>History · Waterline</title></svelte:head>

<div class="page">
	{#if !data.tank}
		<div class="none">
			<EmptyState icon="tank" title="No tanks yet" text="Add your first tank to start logging." href="/tanks/new" label="Add tank" primary />
		</div>
	{:else}
		<div class="layout">
			<nav class="cats" aria-label="Category">
				<span class="caps kicker hide-phone">Category</span>
				<div class="filters hscroll" use:hscroll={data.cat}>
					{#each FILTERS as f (f.key)}
						<a
							class="chip filter"
							class:selected={data.cat === f.key}
							aria-current={data.cat === f.key ? 'true' : undefined}
							href={q({ cat: f.key === 'all' ? null : f.key, entry: null })}
						>
							<span class="f-label">{'short' in f ? f.short : f.label}</span><span class="f-long">{f.label}</span>
							<span class="f-count">{count(f.key)}</span>
						</a>
					{/each}
				</div>
			</nav>

			<div class="list">
				<form class="toolbar" method="GET" action="/history">
					<label class="cat-pick">
						<span class="sr-only">Category</span>
						<select class="input" name="cat" value={data.cat} onchange={pickCat}>
							{#each FILTERS as f (f.key)}<option value={f.key} selected={f.key === data.cat}>{f.label} · {count(f.key)}</option>{/each}
						</select>
					</label>
					<label class="range-pick">
						<span class="sr-only">Date range</span>
						<select class="input" name="range" value={data.range} onchange={submit}>
							{#each RANGES as r (r.key)}<option value={r.key} selected={r.key === data.range}>{r.label}</option>{/each}
						</select>
					</label>
					<noscript><button class="btn apply">Apply</button></noscript>
					<span class="total"
						>{data.total} entr{data.total === 1 ? 'y' : 'ies'}{#if data.older}{' · '}<a class="older-count" href={q({ range: 'all', entry: null })}>{data.older.count} older</a>{/if}</span
					>
				</form>

				{#each data.groups ?? [] as g (g.day)}
					<section>
						<h2 class="day">{g.label}</h2>
						<div class="group">
							{#each g.items as it (it.key)}
								<a class="row" class:selected={data.selected === it.key} aria-current={data.selected === it.key ? 'true' : undefined} href={it.href} onclick={(e) => open(e, it.key)}>
									<CategoryIcon kind={kind(it.icon)} size={40} />
									<span class="text">
										<span class="title">{it.title}</span>
										<span class="sub" class:status-bad={!!it.bad}>{it.sub}{#if it.bad}{' · '}<span class="bad">{it.bad}</span>{/if}</span>
									</span>
									{#if it.thumb}
										<img class="thumb" src={photoUrl(it.thumb)} alt="" loading="lazy" />
									{:else}
										<span class="chev hide-desk" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
									{/if}
								</a>
							{/each}
						</div>
					</section>
				{/each}
				{#if data.groups?.length && data.older}
					<p class="older">
						<span>{data.older.count} older entr{data.older.count === 1 ? 'y' : 'ies'} before {data.older.before}</span>
						<a class="older-link" href={q({ range: 'all', entry: null })}>Show all time</a>
					</p>
				{/if}
				{#if data.groups?.length && importHref}<ImportButton href={importHref} />{/if}
			</div>

			{#if !data.groups?.length}
				<div class="empty-block">
					<span class="hide-desk"><CategoryIcon kind={emptyIcon} size={44} /></span>
					{#if data.older}
						<!-- older entries exist: the range is what's empty, not the tank's history -->
						<h2 class="e-title">Nothing in the {data.rangeLabel.toLowerCase()}</h2>
						<p class="e-text">{data.older.count} older entr{data.older.count === 1 ? 'y' : 'ies'} before {data.older.before}.</p>
						<a class="btn" href={q({ range: 'all', entry: null })}>Show all time</a>
					{:else}
						<h2 class="e-title">Nothing logged here yet</h2>
						<p class="e-text"><span class="hide-desk">Try a longer date range or another category.</span><span class="hide-phone">{emptyText}</span></p>
						{#if importHref}<ImportButton href={importHref} />{/if}
					{/if}
				</div>
			{/if}

			<aside class="detail" aria-label="Entry detail">
				{#if data.detail}
					{@const d = data.detail}
					{@const body = noteBody(d.note, d.title)}
					{@const confirm = confirmCopy(d)}
					<div class="pane">
						<div class="d-head">
							<span class="kicker">{d.kindLabel}</span>
							<h2 class="d-title">{d.title}</h2>
							<span class="d-sub">{d.when} · {data.tank.name}{d.edited ? ` · edited ${d.edited}` : ''}</span>
						</div>
						{#if d.rows.length}
							<div class="drows">
								{#each d.rows as r, i (i)}
									<div class="drow" class:bad={r.level === 'bad'}>
										<span class="dl">{r.label}</span>
										<span class="dv num">{r.value}</span>
										{#if r.statusText}<span class="ds status-{r.level}">{r.statusText}</span>{/if}
									</div>
								{/each}
							</div>
						{/if}
						{#if body}<p class="note">{body}</p>{/if}
						{#if d.photos.length}
							<div class="photos">
								{#each d.photos as p, i (p.id)}<a href="/photos/{p.id}"><img src={photoUrl(p.id)} alt="Photo {i + 1} of this entry" loading="lazy" /></a>{/each}
							</div>
						{/if}
						{#if d.checks}<WorthChecking title={d.checks.title} lead={d.checks.lead} checks={d.checks.checks} />{/if}
						<div class="spacer"></div>
						<div class="actions">
							{#if d.copy}<CopyReadings text={d.copy} />{/if}
							{#if d.editable}<a class="btn" href="{d.href}/edit">Edit</a>{/if}
							<ConfirmDelete
								id="confirm-history-delete"
								title={confirm.title}
								body={confirm.body}
								action="{d.href}?/delete"
								fields={{ from: q({ entry: null }) }}
							/>
						</div>
					</div>
				{:else}
					<!-- the empty state (.empty-block) sits over the top of this pane -->
					<div class="pane">
						<div class="spacer"></div>
						<div class="actions">
							<a class="btn btn-primary" href="/entries/test/new?tank={data.tank.id}">Log water test</a>
						</div>
					</div>
				{/if}
			</aside>
		</div>
	{/if}
</div>

<style>
	/* ── Phone: chips, then the day groups ─────────────────────────────── */
	.page {
		padding: 12px 20px 24px;
	}
	.layout {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.filters {
		gap: 6px;
		margin-inline: -20px;
		padding-inline: 20px;
	}
	.filter {
		height: 36px;
		padding: 0 12px;
		font-size: 13px;
		font-weight: 700;
		color: var(--text);
	}
	.filter.selected,
	.filter.selected:hover {
		color: var(--on-accent);
	}
	.f-long,
	.f-count {
		display: none;
	}
	/* the chosen chip says how many: "All · 42" */
	.filter.selected .f-count {
		display: inline;
	}
	.filter.selected .f-count::before {
		content: '· ';
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		font-size: 13px;
		color: var(--text-muted);
	}
	.cat-pick {
		display: none;
	}
	.cat-pick .input,
	.range-pick .input {
		width: auto;
	}
	/* "Last 30 days ▾", as a line of text on phones */
	.range-pick .input {
		height: 44px;
		padding: 0 18px 0 0;
		border: none;
		background-color: transparent;
		background-position:
			calc(100% - 6px) 54%,
			calc(100% - 2px) 54%;
		background-size: 4px 4px;
		font-size: 13px;
		color: var(--text-muted);
		field-sizing: content;
	}
	.total {
		margin-left: auto;
	}
	/* the end of a short range: what's before it, and the way to it */
	.older {
		margin: 4px 0 0;
		padding: 14px 0;
		border-top: 2px solid var(--ink);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 12px;
		font-size: 14px;
		color: var(--text-muted);
	}
	.older-count {
		color: var(--accent);
		font-weight: 600;
	}
	.older-link {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--accent);
		font-weight: 700;
	}
	.apply {
		min-height: 36px;
		height: 36px;
		font-size: 14px;
	}
	/* one "Nothing logged here yet": a card under the chips on phones, the top of the pane on desktop */
	.empty-block {
		background: var(--surface);
		padding: 18px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}
	.e-title {
		margin: 0;
		font-size: 18px;
	}
	.e-text {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
	}
	section {
		display: flex;
		flex-direction: column;
	}
	/* the day: a kicker over a 2px ink rule */
	.day {
		margin: 0;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		font-size: 11px;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.row {
		position: relative;
		display: flex;
		gap: 12px;
		align-items: center;
		min-height: 60px;
		padding: 10px 0;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	@media (hover: hover) {
		.row:not(.selected):hover {
			background: var(--surface);
			color: var(--text);
		}
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
		font-weight: 700;
	}
	.sub {
		font-size: 12px;
		color: var(--text-muted);
	}
	.sub .bad {
		font-weight: 800;
	}
	.thumb {
		width: 44px;
		height: 44px;
		object-fit: cover;
		flex-shrink: 0;
	}
	.chev {
		display: flex;
		color: var(--neutral-600);
	}
	.detail {
		display: none;
	}

	/* ── Desktop: categories | entries | detail pane ───────────────────── */
	@media (min-width: 1024px) {
		.page {
			padding: 0 0 0 32px;
		}
		.none {
			max-width: 624px;
			padding: 28px 32px 28px 0;
		}
		.layout {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 260px;
			gap: 0;
			min-height: calc(100dvh - 240px);
		}
		/* below 1100 the categories become a select in the toolbar */
		.cats {
			display: none;
		}
		.cat-pick {
			display: block;
		}
		.list {
			grid-column: 1;
			grid-row: 1;
			padding: 20px 24px 32px 0;
			gap: 18px;
		}
		.toolbar {
			gap: 8px 12px;
		}
		.range-pick .input {
			height: 44px;
			padding: 0 40px 0 12px;
			border: 1px solid var(--divider);
			background-color: var(--surface);
			background-position:
				calc(100% - 21px) 52%,
				calc(100% - 16px) 52%;
			background-size: 5px 5px;
			font-size: 15px;
			color: var(--text);
			field-sizing: content;
		}
		.row {
			padding: 10px 10px 10px 8px;
			border-left: 3px solid transparent;
			min-height: 0;
		}
		.row.selected {
			background: var(--surface);
			border-left-color: var(--accent);
		}
		.thumb {
			width: 40px;
			height: 40px;
		}
		.detail {
			grid-column: 2;
			grid-row: 1;
			display: block;
			min-width: 0;
			background: var(--surface);
			border-left: 2px solid var(--divider);
		}
		/* full height; long tests scroll inside, Edit/Delete stay at the bottom */
		.pane {
			position: sticky;
			top: 0;
			height: calc(100dvh - 190px);
			overflow-y: auto;
			padding: 20px 20px 0;
			display: flex;
			flex-direction: column;
			gap: 16px;
		}
		/* the full window height once the tank header has scrolled away */
		@supports (animation-timeline: scroll()) {
			.pane {
				animation: pane-fill linear both;
				animation-timeline: scroll(root);
				animation-range: 0px 190px;
			}
		}
		@keyframes pane-fill {
			to {
				height: 100dvh;
			}
		}
		.spacer {
			flex: 1;
		}
		.d-head {
			display: flex;
			flex-direction: column;
			gap: 4px;
		}
		.d-title {
			margin: 0;
			font-size: 22px;
			overflow-wrap: anywhere;
		}
		.d-sub {
			font-size: 14px;
			color: var(--text-muted);
		}
		.empty-block {
			grid-column: 2;
			grid-row: 1;
			z-index: 1;
			align-self: start;
			align-items: stretch;
			padding: 20px 20px 0;
			gap: 8px;
			background: transparent;
		}
		.empty-block :global(.btn) {
			height: auto;
			padding: 10px 14px;
			white-space: normal;
			text-align: left;
		}
		.e-title {
			font-size: 22px;
		}
		.e-text {
			margin-bottom: 8px;
		}
		.drows {
			flex-shrink: 0;
			border-top: 2px solid var(--ink);
		}
		.drow {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto 84px;
			gap: 12px;
			align-items: baseline;
			padding: 8px;
			border-bottom: 1px solid var(--divider);
			font-size: 14px;
		}
		.drow.bad {
			background: var(--bg);
		}
		.dl {
			min-width: 0;
			color: var(--text-2);
		}
		.drow.bad .dl {
			color: var(--bad);
		}
		.dv {
			font-size: 15px;
			font-weight: 800;
			white-space: nowrap;
		}
		.ds {
			text-align: right;
			font-size: 12px;
			font-weight: 800;
		}
		.note {
			margin: 0;
			font-size: 15px;
			line-height: 1.5;
			white-space: pre-wrap;
			overflow-wrap: anywhere;
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
			display: block;
		}
		.actions {
			position: sticky;
			bottom: 0;
			padding: 12px 0 20px;
			background: var(--surface);
			display: flex;
			gap: 10px;
		}
		.actions > :global(.btn) {
			flex: 1;
		}
	}
	/* the category column (main ≥ 780px) */
	@media (min-width: 1100px) {
		.layout {
			grid-template-columns: 150px minmax(0, 1fr) 270px;
		}
		.cats {
			grid-column: 1;
			grid-row: 1;
			display: flex;
			flex-direction: column;
			min-width: 0;
			padding: 24px 12px 32px 0;
			border-right: 2px solid var(--divider);
		}
		.cat-pick {
			display: none;
		}
		.cats .caps {
			padding: 0 8px 8px;
		}
		.filters {
			flex-direction: column;
			gap: 0;
			margin: 0;
			padding: 0;
			overflow: visible;
			-webkit-mask-image: none;
			mask-image: none;
		}
		.filter,
		.filter.selected,
		.filter.selected:hover {
			height: 40px;
			padding: 0 8px;
			border: none;
			justify-content: space-between;
			background: transparent;
			font-size: 14px;
			font-weight: 400;
			color: var(--text);
		}
		.filter::after {
			content: none;
		}
		.filter:hover {
			background: var(--surface);
		}
		.filter.selected,
		.filter.selected:hover {
			background: var(--surface);
			font-weight: 800;
		}
		.f-label {
			display: none;
		}
		.f-long,
		.f-count,
		.filter.selected .f-count {
			display: inline;
		}
		.f-count {
			font-size: 12px;
			font-weight: 400;
			color: var(--text-muted);
		}
		.filter.selected .f-count::before {
			content: none;
		}
		.list {
			grid-column: 2;
			padding: 20px 24px 32px;
		}
		.detail,
		.empty-block {
			grid-column: 3;
		}
	}
	@media (min-width: 1200px) {
		.layout {
			grid-template-columns: 160px minmax(352px, 1fr) 300px;
		}
		.cats {
			padding-right: 16px;
		}
		.pane,
		.empty-block {
			padding: 24px 24px 0;
		}
		.actions {
			padding-bottom: 24px;
		}
		.drow {
			grid-template-columns: minmax(0, 1fr) auto 96px;
		}
	}
</style>
