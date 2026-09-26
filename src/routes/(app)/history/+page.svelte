<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { hscroll } from '$lib/actions';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
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
	type Kind = ComponentProps<typeof CategoryIcon>['kind'];
	const kind = (icon: string) => icon as Kind;
	// The empty list shows the icon of the category picked.
	const emptyIcon = $derived((data.cat === 'all' ? 'note' : data.cat) as Kind);

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
	<a class="back hide-desk" href="/">‹ Dashboard</a>
	<div class="head hide-desk">
		<h1>History</h1>
		{#if data.tank}<button type="button" class="tank" onclick={() => (ui.tankSwitcher = true)}>{data.tank.name} ▾</button>{/if}
	</div>

	{#if !data.tank}
		<div class="none">
			<EmptyState icon="tank" title="No tanks yet" text="Add your first tank to start logging." href="/tanks/new" label="Add tank" primary />
		</div>
	{:else}
		<div class="layout" class:with-detail={!!data.detail}>
			<nav class="cats" aria-label="Category">
				<div class="cats-inner">
					<div class="caps hide-phone">Category</div>
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
				</div>
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
					<noscript><button class="btn apply">Apply</button></noscript>
					<span class="total">{data.total} entr{data.total === 1 ? 'y' : 'ies'}</span>
				</form>

				{#if !data.groups?.length}
					<EmptyState compact icon={emptyIcon} title="Nothing logged here yet" text="Try a longer date range or another category." />
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
										<span class="sub">{it.sub}{#if it.bad}{' · '}<span class="status-bad strong">{it.bad}</span>{/if}</span>
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

			{#if data.detail}
				{@const d = data.detail}
				{@const body = noteBody(d.note, d.title)}
				{@const confirm = confirmCopy(d)}
				<aside class="detail" aria-label="Entry detail">
					<div class="pane">
						<div class="d-head">
							<h2 class="d-title">{d.title}</h2>
							<div class="d-sub">{d.when} · {data.tank.name}{d.edited ? ` · edited ${d.edited}` : ''}</div>
						</div>
						{#if d.rows.length}
							<div class="rows">
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
						<div class="actions">
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
				</aside>
			{/if}
		</div>
	{/if}
</div>

<style>
	.page {
		padding: 0 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	/* 11: the links keep 44px tap areas; the text sits where the design puts it */
	.back {
		margin-top: -7px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		margin-top: -18px;
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
		margin-block: -10px;
	}
	.layout {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	/* 11: category chips that scroll sideways, to the screen edge */
	.filters {
		margin-inline: -20px;
		padding-inline: 20px;
	}
	.filter {
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
		gap: 12px;
		font-size: 13px;
		color: var(--text-muted);
		/* the 44px select, laid out like the 13px line in 11 */
		margin-block: -13px -21px;
	}
	/* "Last 30 days ▾" */
	.range select {
		appearance: none;
		-webkit-appearance: none;
		min-height: 44px;
		padding: 0 18px 0 0;
		border: none;
		border-radius: 8px;
		background-color: transparent;
		background-image:
			linear-gradient(45deg, transparent 50%, var(--text-muted) 50%),
			linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);
		background-position:
			calc(100% - 6px) 54%,
			calc(100% - 2px) 54%;
		background-size: 4px 4px;
		background-repeat: no-repeat;
		font-size: 13px;
		color: var(--text-muted);
		cursor: pointer;
		/* the ▾ right after the chosen range, not after the longest one */
		field-sizing: content;
	}
	/* without JS: fits the 44px row */
	.apply {
		min-height: 36px;
		height: 36px;
		font-size: 14px;
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
	}
	.row {
		position: relative;
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 12px;
		color: var(--text);
	}
	.row + .row {
		border-top: 1px solid var(--border);
	}
	.row:first-child {
		border-top-left-radius: 13px;
		border-top-right-radius: 13px;
	}
	.row:last-child {
		border-bottom-left-radius: 13px;
		border-bottom-right-radius: 13px;
	}
	@media (hover: hover) {
		.row:not(.selected):hover {
			background: var(--surface-hi);
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
	.detail {
		display: none;
	}

	/* ── D6: categories | entries | detail pane ──────────────────── */
	@media (min-width: 1024px) {
		.page {
			padding: 0;
			gap: 0;
		}
		.none {
			max-width: 624px;
			padding: 28px 32px;
		}
		.layout {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto 1fr;
			gap: 0;
			min-height: calc(100dvh - 72px);
		}
		.layout.with-detail {
			grid-template-columns: minmax(0, 1fr) clamp(300px, 29.7vw, 380px);
		}
		/* narrow desktop: the category chips stay above the list */
		.cats {
			grid-column: 1;
			min-width: 0;
			padding: 18px 24px 2px;
		}
		.filters {
			margin: 0;
			padding-inline: 0;
		}
		.list {
			grid-column: 1;
			padding: 16px 24px 32px;
		}
		.detail {
			grid-column: 2;
			grid-row: 1 / span 2;
		}
		.range {
			margin: 0;
			font-size: 14px;
		}
		.range select {
			height: 40px;
			min-height: 40px;
			padding: 0 34px 0 14px;
			border: 1px solid var(--border-strong);
			border-radius: 10px;
			background-position:
				calc(100% - 19px) 52%,
				calc(100% - 14px) 52%;
			background-size: 5px 5px;
			font-size: 14px;
			color: var(--text);
		}
		.range select:hover {
			background-color: var(--surface-hi);
		}
		.day {
			font-size: 12px;
			letter-spacing: 0.06em;
		}
		.group {
			border-radius: 12px;
		}
		.row {
			padding: 10px 12px;
		}
		.row:first-child {
			border-top-left-radius: 11px;
			border-top-right-radius: 11px;
		}
		.row:last-child {
			border-bottom-left-radius: 11px;
			border-bottom-right-radius: 11px;
		}
		/* D6: the entry in the pane, accent border and tint; its icon tile stays visible */
		.row.selected {
			z-index: 1;
			background: var(--selected);
		}
		.row.selected::after {
			content: '';
			position: absolute;
			inset: -1px;
			border: 1px solid var(--accent);
			border-radius: inherit;
			pointer-events: none;
		}
		.row.selected:first-child::after {
			border-top-left-radius: 12px;
			border-top-right-radius: 12px;
		}
		.row.selected:last-child::after {
			border-bottom-left-radius: 12px;
			border-bottom-right-radius: 12px;
		}
		.row.selected :global(.icon) {
			background: var(--surface-2);
		}
		.thumb {
			width: 40px;
			height: 40px;
		}
		.detail {
			display: block;
			min-width: 0;
			background: var(--surface-2);
			border-left: 1px solid var(--border);
		}
		/* full height; long tests scroll inside, Edit/Delete stay at the bottom */
		.pane {
			position: sticky;
			top: 0;
			height: calc(100dvh - 72px);
			overflow-y: auto;
			padding: 22px 22px 0;
			display: flex;
			flex-direction: column;
			gap: 16px;
		}
		/* the full window height once the header has scrolled away */
		@supports (animation-timeline: scroll()) {
			.pane {
				animation: pane-fill linear both;
				animation-timeline: scroll(root);
				animation-range: 0px 72px;
			}
		}
		.d-head {
			display: flex;
			flex-direction: column;
			gap: 4px;
		}
		.d-title {
			margin: 0;
			font-size: 20px;
			font-weight: 600;
			overflow-wrap: anywhere;
		}
		.d-sub {
			font-size: 14px;
			color: var(--text-muted);
		}
		.rows {
			flex-shrink: 0;
			border-radius: 14px;
			background: var(--surface);
			border: 1px solid var(--border);
			overflow: hidden;
		}
		.drow {
			display: flex;
			align-items: baseline;
			gap: 10px;
			padding: 10px 14px;
			font-size: 15px;
		}
		.drow + .drow {
			border-top: 1px solid var(--border);
		}
		.drow.bad {
			background: var(--bad-bg);
		}
		.dl {
			flex: 1;
			min-width: 0;
			color: var(--text-muted);
		}
		.drow.bad .dl {
			color: var(--bad-text);
		}
		.dv {
			font-weight: 600;
			white-space: nowrap;
		}
		.ds {
			min-width: 92px;
			max-width: 50%;
			text-align: right;
			font-size: 13px;
			font-weight: 600;
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
			border-radius: 8px;
			display: block;
		}
		.actions {
			position: sticky;
			bottom: 0;
			margin-top: auto;
			padding: 12px 0 22px;
			background: var(--surface-2);
			display: flex;
			gap: 10px;
		}
		.actions > :global(.btn) {
			flex: 1;
			border-radius: 10px;
		}
	}
	/* D6: the category column */
	@media (min-width: 1200px) {
		.layout {
			grid-template-columns: clamp(168px, 15.6vw, 200px) minmax(0, 1fr);
			grid-template-rows: none;
		}
		.layout.with-detail {
			grid-template-columns: clamp(168px, 15.6vw, 200px) minmax(0, 1fr) clamp(300px, 29.7vw, 380px);
		}
		.cats,
		.list,
		.detail {
			grid-column: auto;
			grid-row: auto;
		}
		.cats {
			padding: 0;
			border-right: 1px solid var(--border);
		}
		.cats-inner {
			position: sticky;
			top: 0;
			padding: 20px 16px;
		}
		.caps {
			font-size: 12px;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--text-faint);
			padding: 0 8px 8px;
		}
		.filters {
			flex-direction: column;
			gap: 4px;
			padding: 0;
			overflow: visible;
		}
		.filter {
			height: 38px;
			padding: 0 10px;
			border: none;
			border-radius: 8px;
			justify-content: space-between;
			font-size: 14px;
			color: var(--text-2);
		}
		.filter::after {
			content: none;
		}
		.filter.selected,
		.filter.selected:hover {
			background: var(--selected);
			color: var(--text);
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
			font-weight: 400;
			color: var(--text-faint);
		}
		.filter.selected .f-count {
			color: var(--text-muted);
		}
		.list {
			padding: 16px 24px 32px;
		}
	}
	@media (min-width: 1024px) and (max-width: 1199px) {
		.caps {
			display: none;
		}
	}
	@keyframes pane-fill {
		to {
			height: 100dvh;
		}
	}
</style>
