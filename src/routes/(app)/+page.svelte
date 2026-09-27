<script lang="ts">
	import { tankTypeLabel } from '$lib/types';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import AccountMenu from '$lib/components/AccountMenu.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ImportButton from '$lib/components/ImportButton.svelte';
	import ParamCard from '$lib/components/ParamCard.svelte';
	import TankThumb from '$lib/components/TankThumb.svelte';
	import TaskList from '$lib/components/TaskList.svelte';
	import RemindMe from '$lib/components/RemindMe.svelte';
	import TrendChart from '$lib/components/TrendChart.svelte';
	import WhatsNew from '$lib/components/WhatsNew.svelte';
	import { compactName, displayValue, fmtRange, fmtValue, paramDecimals, paramUnit, shortName, statusOf } from '$lib/params';
	import { statusShort } from '$lib/status';
	import { goto, invalidateAll } from '$app/navigation';
	import { discard, retry } from '$lib/offline';
	import { toast, ui } from '$lib/ui.svelte';
	import { photoUrl } from '$lib/media';
	import { hscroll } from '$lib/actions';

	let { data } = $props();
	const prefs = $derived(data.user);
	const current = $derived(data.tanks.find((t) => t.id === data.currentTankId));

	/** "Rotala, Ludwigia, Java fern +3" */
	const preview = (items: string[], n = 3) => items.slice(0, n).join(', ') + (items.length > n ? ` +${items.length - n}` : '');

	// An entry the server refused while syncing: send it again, or drop it.
	async function retryEntry(id: string) {
		if ((await retry(id)) > 0) {
			toast('✓ Synced');
			invalidateAll();
		}
	}

	const cards = $derived(
		(data.params ?? []).map((p) => {
			const r = data.latest?.[p.id];
			const st = statusOf(p, r?.value);
			const range = fmtRange(p, prefs, false);
			return {
				id: p.id,
				label: shortName(p),
				short: compactName(p),
				fullName: p.name,
				value: r ? fmtValue(p, r.value, prefs) : null,
				unit: paramUnit(p, prefs),
				level: st.level,
				statusText: statusShort(st),
				sub: r ? (range ? `Target ${range}` : 'No target') : 'Not tested',
				range: r ? range : '',
				spark: data.sparks?.[p.id] ?? []
			};
		})
	);
	const hasReadings = $derived(cards.some((c) => c.value != null));
	const bad = $derived(cards.filter((c) => c.level === 'bad'));

	// Trends: parameters with at least one reading in the window; pick one.
	const trendable = $derived(
		(data.params ?? []).filter((p) => (data.trends?.find((t) => t.parameterId === p.id)?.points.length ?? 0) > 0)
	);
	let selected = $state<string | null>(null);
	const chosen = $derived(
		trendable.find((p) => p.id === selected) ??
			trendable.find((p) => statusOf(p, data.latest?.[p.id]?.value).level === 'bad') ??
			trendable[0]
	);
	const chosenPoints = $derived(
		chosen
			? (data.trends?.find((t) => t.parameterId === chosen.id)?.points ?? []).map((pt) => ({
					t: pt.t,
					v: displayValue(chosen, pt.value, prefs)
				}))
			: []
	);

	// G1: swipe left or right on the tank name for the next or previous tank; a tap opens the switcher.
	let touch = { x: 0, y: 0 };
	let swiped = false;
	function swipeStart(e: TouchEvent) {
		touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
		swiped = false;
	}
	function swipeEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - touch.x;
		const dy = e.changedTouches[0].clientY - touch.y;
		if (Math.abs(dx) < 48 || Math.abs(dy) > 32 || data.tanks.length < 2) return;
		const i = data.tanks.findIndex((t) => t.id === data.currentTankId);
		const next = data.tanks[(i + (dx < 0 ? 1 : -1) + data.tanks.length) % data.tanks.length];
		swiped = true;
		e.preventDefault(); // no click, so the switcher doesn't open too
		goto(`/?tank=${next.id}`);
	}

	const wc = $derived(data.waterChange);
	const wcOver = $derived(wc && wc.days != null && wc.days > wc.goal ? wc.days - wc.goal : 0);
</script>

<svelte:head><title>{data.tank ? `${data.tank.name} · Waterline` : 'Waterline'}</title></svelte:head>

{#if !data.tank}
	<div class="page">
		<div class="head-row">
			<span class="hide-desk"><AccountMenu user={data.user} id="account-menu-dash" /></span>
			<h1 class="title">Dashboard</h1>
		</div>
		<EmptyState icon="tank" title="No tanks yet" text="Add your first tank to start logging." href="/tanks/new" label="Add tank" primary />
	</div>
{:else}
	<div class="page">
		<h1 class="sr-only">{data.tank.name} dashboard</h1>
		<div class="head-row">
			<!-- phones: your account in the upper left; desktop has it in the sidebar -->
			<AccountMenu user={data.user} id="account-menu-dash" />
		<button
			type="button"
			class="tank-head"
			ontouchstart={swipeStart}
			ontouchend={swipeEnd}
			onclick={() => {
				if (!swiped) ui.tankSwitcher = true;
				swiped = false;
			}}
		>
			<TankThumb cover={current?.cover} />
			<span class="th-text">
				<span class="th-name">{data.tank.name} <span class="caret">▾</span></span>
				<span class="th-sub"
					>{tankTypeLabel(data.tank.type)}{current?.volume ? ` · ${current.volume}` : ''}{data.tanks.length > 1
						? ` · ${data.tanks.length} tanks`
						: ''}</span
				>
			</span>
		</button>
		</div>

		{#if data.whatsNew}<WhatsNew {...data.whatsNew} />{/if}

		<div class="grid">
			<div class="col-main">
				{#if !hasReadings}
					<EmptyState
						icon="test"
						title="No readings yet"
						text="Log your first water test to see status for each parameter. Every field is optional."
						href="/entries/test/new?tank={data.tank.id}"
						label="Log first water test"
						primary
					>
						<ImportButton href="/tanks/{data.tank.id}/import/tests" label="Import past tests" />
					</EmptyState>
				{:else}
					<div class="summary-row">
						{#if bad.length}
							<div class="summary bad">
								<div class="s-title">✕ {bad.length} out of range</div>
								<div class="s-detail">{bad.map((c) => `${c.label} ${c.value}${c.unit ? ' ' + c.unit : ''}`).join(', ')}</div>
							</div>
						{:else}
							<div class="summary ok">
								<div class="s-title">✓ All in range</div>
								<div class="s-detail">
									{cards.filter((c) => c.value != null).length} parameters tested
								</div>
							</div>
						{/if}
						<div class="card wc-small">
							<div class="muted sm">Since water change</div>
							<div class="big-num">
								<span class="num">{wc?.days ?? '—'}</span>
								<span class="muted">{wc?.days == null ? 'none logged' : `day${wc.days === 1 ? '' : 's'} · goal ${wc.goal}`}</span>
							</div>
						</div>
					</div>

					<section class="stack readings">
						<div class="section-head">
							<h2>Latest readings</h2>
							<!-- desktop has no summary card above, so the count is here -->
							<span class="meta"
								>{data.latestWhen}{#if bad.length}<span class="hide-phone"
										>{' · '}<span class="status-bad">{bad.length} out of range</span></span
									>{/if}</span
							>
						</div>
						<div class="cards" style:--cols={Math.min(cards.length, 7)}>
							{#each cards as c (c.id)}
								<ParamCard {...c} compact />
							{/each}
						</div>
					</section>

					<section class="stack trends">
						<div class="section-head">
							<h2>Trends <span class="meta">· Last 4 weeks</span></h2>
							<a href="/charts{chosen ? `?p=${chosen.id}` : ''}">Charts</a>
						</div>
						{#if trendable.length}
							<div class="chips hscroll" role="group" aria-label="Parameter" use:hscroll={chosen?.id}>
								{#each trendable as p (p.id)}
									<button
										type="button"
										class="chip"
										aria-pressed={chosen?.id === p.id}
										onclick={() => (selected = p.id)}>{shortName(p)}</button
									>
								{/each}
							</div>
						{/if}
						<div class="card chart-card">
							{#if chosen && chosenPoints.length >= 2}
								<div class="chart-box"><div class="chart-fill"><TrendChart
									fit
									points={chosenPoints}
									band={{
										min: chosen.min == null ? null : displayValue(chosen, chosen.min, prefs),
										max: chosen.max == null ? null : displayValue(chosen, chosen.max, prefs)
									}}
									markers={data.markers}
									from={data.trendFrom}
									to={Date.now()}
									lastLevel={statusOf(chosen, data.latest?.[chosen.id]?.value).level}
									label="{chosen.name} over the last 4 weeks"
									name={chosen.name}
									unit={paramUnit(chosen, prefs)}
									decimals={paramDecimals(chosen, prefs)}
									timeZone={data.user.timeZone}
								/></div></div>
								<div class="legend">
									{#if fmtRange(chosen, prefs)}
										<span><i class="lg-band"></i>Target {fmtRange(chosen, prefs)}</span>
									{/if}
									{#if data.markers.length}<span><i class="lg-marker"></i>Water change</span>{/if}
								</div>
							{:else}
								<p class="muted chart-empty">Charts appear after your second test. Tap + to log another.</p>
							{/if}
						</div>
						{#if data.notes?.length}
							<!-- Spotting trends: tap one to see its chart -->
							<ul class="noticed" aria-label="Noticed">
								{#each data.notes as n (`${n.parameterId}:${n.kind}`)}
									{@const chartable = trendable.some((p) => p.id === n.parameterId)}
									<li>
										<svelte:element
											this={chartable ? 'button' : 'div'}
											type={chartable ? 'button' : undefined}
											class="note"
											aria-pressed={chartable ? chosen?.id === n.parameterId : undefined}
											onclick={chartable ? () => (selected = n.parameterId) : undefined}
											role={chartable ? undefined : 'note'}
										>
											<span class="arrow" class:status-warn={n.warn} aria-hidden="true">{n.direction === 'up' ? '↗' : '↘'}</span>
											<span>{n.text}</span>
										</svelte:element>
									</li>
								{/each}
							</ul>
						{/if}
					</section>
				{/if}
			</div>

			<div class="col-side">
				{#if hasReadings}
					<div class="card wc-large">
						<div>
							<div class="muted sm">Since last water change</div>
							<div class="big-num">
								<span class="num">{wc?.days ?? '—'}</span>
								<span class="muted">{wc?.days == null ? 'none logged' : `day${wc.days === 1 ? '' : 's'} · goal ${wc.goal}`}</span>
							</div>
						</div>
						{#if wcOver}<span class="status-bad sm strong">✕ {wcOver} day{wcOver === 1 ? '' : 's'} over</span>{/if}
					</div>
				{/if}

				<section class="stack">
					<div class="section-head">
						<h2>Due</h2>
						<span class="links"
							><RemindMe tankId={data.tank.id} tankName={data.tank.name} today={data.today} cls="remind-link" /><a href="/tasks">All tasks</a></span
						>
					</div>
					{#if data.tasks.length}
						<TaskList tasks={data.tasks.slice(0, 3)} today={data.today} />
					{:else}
						<EmptyState
							compact
							icon="maintenance"
							title="Nothing due"
							text="Set up reminders for water changes and upkeep."
							href="/tasks/new?tank={data.tank.id}"
							label="New task"
						/>
					{/if}
				</section>

				<section class="stack recent">
					<div class="section-head">
						<h2>Recent activity</h2>
						<span class="links"><a href="/photos">Photos</a><a href="/history">History</a></span>
					</div>
					<ul class="feed">
						{#each ui.queue.filter((q) => q.tankId === data.tank?.id) as q (q.id)}
							<li>
								<div class="queued">
									<CategoryIcon kind={q.title.startsWith('Water test') ? 'test' : 'note'} size={40} />
									<span class="f-text">
										<span class="f-title">{q.title}</span>
										<span class="f-sub" class:status-warn={!q.error} class:status-bad={!!q.error}>{q.error ? `✕ ${q.error}` : '▲ Waiting to sync'}</span>
									</span>
									{#if q.error}
										<span class="q-actions">
											<button type="button" class="btn" onclick={() => retryEntry(q.id)}>Retry</button>
											<button type="button" class="btn" onclick={() => discard(q.id)}>Discard</button>
										</span>
									{/if}
								</div>
							</li>
						{/each}
						{#each data.activity as a (a.href)}
							<li>
								<a href={a.href}>
									<CategoryIcon kind={a.icon} size={40} />
									<span class="f-text">
										<span class="f-title">{a.title}</span>
										<span class="f-sub">{a.sub}</span>
									</span>
									{#if a.thumb}
										<img class="f-thumb" src={photoUrl(a.thumb)} alt="" loading="lazy" />
									{:else}
										<span class="chev" aria-hidden="true">›</span>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				</section>

				<section class="stack in-tank">
					<div class="section-head">
						<h2>In the tank</h2>
						<a href="/tanks/{data.tank.id}">Details</a>
					</div>
					<div class="card contents">
						{#each [
							{ tab: 'livestock', title: 'Livestock', count: data.contents.animals ? `${data.contents.animals} in ${data.contents.livestock.length} species` : '', items: data.contents.livestock, extra: data.contents.quarantine ? `${data.contents.quarantine} in quarantine` : '' },
							{ tab: 'plants', title: 'Plants', count: data.contents.plants.length ? String(data.contents.plants.length) : '', items: data.contents.plants, extra: '' },
							{ tab: 'equipment', title: 'Equipment', count: data.contents.equipment.length ? String(data.contents.equipment.length) : '', items: data.contents.equipment, extra: '' }
						] as row (row.tab)}
							<a class="c-row" href="/tanks/{data.tank.id}/{row.tab}">
								<span class="f-text">
									<span class="f-title">{row.title}{row.count ? ` · ${row.count}` : ''}</span>
									<span class="f-sub">{row.items.length ? preview(row.items) : 'None added yet'}{row.extra ? ` · ${row.extra}` : ''}</span>
								</span>
								<span class="chev" aria-hidden="true">›</span>
							</a>
						{/each}
					</div>
				</section>
			</div>
		</div>
	</div>
{/if}

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.title {
		margin: 8px 0;
		font-size: 28px;
		font-weight: 600;
	}
	.head-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: -4px;
	}
	.tank-head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		color: var(--text);
		text-align: left;
	}
	.th-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.th-name {
		font-size: 22px;
		font-weight: 600;
	}
	.caret {
		font-size: 14px;
		color: var(--text-muted);
	}
	.th-sub {
		font-size: 13px;
		color: var(--text-muted);
	}
	.grid,
	.col-main,
	.col-side {
		display: flex;
		flex-direction: column;
		gap: 24px;
		min-width: 0;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.links {
		display: flex;
		gap: 16px;
	}
	/* Phones read top to bottom: summary, readings, due, trends, recent activity (03). */
	@media (max-width: 1023px) {
		.col-main,
		.col-side {
			display: contents;
		}
		.trends {
			order: 1;
		}
		.recent {
			order: 2;
		}
		.in-tank {
			order: 3;
		}
	}
	.sm {
		font-size: 13px;
	}
	.strong {
		font-weight: 600;
	}
	.summary-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.summary {
		border-radius: 16px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.summary.bad {
		background: var(--bad-bg);
	}
	.summary.ok {
		background: var(--ok-bg);
	}
	.s-title {
		font-size: 13px;
		font-weight: 600;
	}
	.bad .s-title {
		color: var(--bad-text);
	}
	.ok .s-title {
		color: var(--ok-text);
	}
	.s-detail {
		font-size: 15px;
		line-height: 1.35;
	}
	.wc-small {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.big-num {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-size: 14px;
	}
	.big-num .num {
		font-size: 26px;
		font-weight: 600;
	}
	.wc-large {
		display: none;
	}
	.cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	/* chips run to the screen edge on phones (03) */
	.chips {
		margin-inline: -20px;
		padding-inline: 20px;
	}
	.chart-card {
		padding: 14px 14px 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.chart-box {
		position: relative;
		height: 132px;
	}
	.chart-fill {
		position: absolute;
		inset: 0;
	}
	.chart-empty {
		margin: 8px 0;
		font-size: 14px;
		line-height: 1.5;
	}
	/* Spotting trends: a line or two under the chart */
	.noticed {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.note {
		display: flex;
		align-items: baseline;
		gap: 10px;
		width: 100%;
		min-height: 44px;
		padding: 10px 2px;
		text-align: left;
		font-size: 14px;
		line-height: 1.45;
		color: var(--text-2);
	}
	.noticed li + li .note {
		border-top: 1px solid var(--divider-soft);
	}
	.arrow {
		flex-shrink: 0;
		width: 16px;
		font-weight: 700;
		color: var(--text-muted);
	}
	button.note[aria-pressed='true'] {
		color: var(--text);
	}
	@media (hover: hover) {
		button.note:hover {
			color: var(--text);
		}
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		font-size: 12px;
		color: var(--text-muted);
	}
	.legend span {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.lg-band {
		width: 14px;
		height: 8px;
		background: var(--band);
		border: 1px dashed var(--accent);
	}
	.lg-marker {
		width: 10px;
		height: 10px;
		border-radius: 5px;
		background: var(--border);
		border: 1px solid var(--text-muted);
	}
	.feed {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.feed a {
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 8px;
		margin: 0 -8px;
		border-radius: 12px;
		color: var(--text);
	}
	.feed a:hover {
		background: var(--surface);
	}
	.f-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.f-title {
		font-size: 15px;
		font-weight: 600;
	}
	.f-sub {
		font-size: 13px;
		color: var(--text-muted);
	}
	.chev {
		font-size: 18px;
		color: var(--placeholder);
	}
	.contents {
		padding: 4px 14px;
	}
	.c-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 60px;
		padding: 10px 0;
		color: var(--text);
	}
	.c-row + .c-row {
		border-top: 1px solid var(--border);
	}
	.queued {
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 8px 0;
	}
	.queued .f-sub {
		font-weight: 600;
	}
	.q-actions {
		display: flex;
		gap: 6px;
	}
	.q-actions .btn {
		padding: 0 12px;
		font-size: 14px;
	}
	.f-thumb {
		width: 52px;
		height: 52px;
		border-radius: 10px;
		object-fit: cover;
		flex-shrink: 0;
	}

	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
		}
		.head-row {
			display: none;
		}
		.grid {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 360px;
			gap: 28px;
		}
		/* Trends is one card with its chips (07) and grows so both columns end together. */
		.trends {
			flex: 1;
			gap: 14px;
			padding: 18px 20px;
			border-radius: 16px;
			background: var(--surface);
			border: 1px solid var(--border);
		}
		/* the card has room for every chip, so they wrap instead of scrolling */
		.chips {
			margin-inline: 0;
			padding-inline: 0;
			flex-wrap: wrap;
		}
		.chart-card {
			flex: 1;
			padding: 0;
			border: none;
			background: none;
		}
		.chart-box {
			flex: 1;
			height: auto;
			min-height: 240px;
		}
		/* 1a: one row, seven at most, then a second row; four across while the
		   column is too narrow for seven 76px cards (the widest range, 1250–1400, fits) */
		.readings {
			container: readings / inline-size;
		}
		.cards {
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 8px;
		}
		@container readings (min-width: 580px) {
			.cards {
				grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
			}
		}
		.summary-row,
		.wc-small {
			display: none;
		}
		.wc-large {
			display: flex;
			align-items: center;
			gap: 16px;
			justify-content: space-between;
			padding: 18px;
		}
		.wc-large .big-num .num {
			font-size: 34px;
		}
		.wc-large .big-num {
			font-size: 15px;
		}
	}
</style>
