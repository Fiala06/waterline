<script lang="ts">
	import { tankTypeLabel } from '$lib/types';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import ParamCard from '$lib/components/ParamCard.svelte';
	import TankThumb from '$lib/components/TankThumb.svelte';
	import TaskList from '$lib/components/TaskList.svelte';
	import TrendChart from '$lib/components/TrendChart.svelte';
	import { displayValue, fmtRange, fmtValue, paramUnit, shortName, statusOf } from '$lib/params';
	import { statusShort } from '$lib/status';
	import { invalidateAll } from '$app/navigation';
	import { discard, retry } from '$lib/offline';
	import { toast, ui } from '$lib/ui.svelte';
	import { photoUrl } from '$lib/media';

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
				value: r ? fmtValue(p, r.value, prefs) : null,
				unit: paramUnit(p, prefs),
				level: st.level,
				statusText: statusShort(st),
				sub: r ? (range ? `Target ${range}` : 'No target') : 'Not tested'
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

	const wc = $derived(data.waterChange);
	const wcOver = $derived(wc && wc.days != null && wc.days > wc.goal ? wc.days - wc.goal : 0);
</script>

<svelte:head><title>{data.tank ? `${data.tank.name} · Waterline` : 'Waterline'}</title></svelte:head>

{#if !data.tank}
	<div class="page">
		<h1 class="title">Dashboard</h1>
		<div class="empty">
			<CategoryIcon kind="note" size={44} />
			<h2>No tanks yet</h2>
			<p>Add your first tank to start logging.</p>
			<a class="btn btn-primary" href="/tanks/new">Add tank</a>
		</div>
	</div>
{:else}
	<div class="page">
		<h1 class="sr-only">{data.tank.name} dashboard</h1>
		<button type="button" class="tank-head" onclick={() => (ui.tankSwitcher = true)}>
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

		<div class="grid">
			<div class="col-main">
				{#if !hasReadings}
					<div class="empty">
						<CategoryIcon kind="test" size={44} />
						<h2>No readings yet</h2>
						<p>Log your first water test to see status for each parameter. Every field is optional.</p>
						<a class="btn btn-primary" href="/log/test?tank={data.tank.id}">Log first water test</a>
					</div>
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

					<section class="stack">
						<div class="section-head">
							<h2>Latest readings</h2>
							<span class="meta">{data.latestWhen}</span>
						</div>
						<div class="cards">
							{#each cards as c (c.id)}
								<ParamCard {...c} />
							{/each}
						</div>
					</section>

					<section class="stack trends">
						<div class="section-head">
							<h2>Trends <span class="meta">· last 4 weeks</span></h2>
							<a href="/charts{chosen ? `?p=${chosen.id}` : ''}">Charts</a>
						</div>
						{#if trendable.length}
							<div class="chips" role="group" aria-label="Parameter">
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
								<TrendChart
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
								/>
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
						<a href="/tasks">All tasks</a>
					</div>
					{#if data.tasks.length}
						<TaskList tasks={data.tasks.slice(0, 3)} today={data.today} />
					{:else}
						<div class="card nothing">
							<strong>Nothing due</strong>
							<span class="muted">Set up reminders for water changes and upkeep.</span>
						</div>
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
	.empty {
		border-radius: 18px;
		background: var(--surface);
		border: 1px dashed var(--border-strong);
		padding: 24px 20px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
	}
	.empty h2 {
		margin: 0;
		font-size: 19px;
		font-weight: 600;
	}
	.empty p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.empty .btn {
		margin-top: 6px;
		height: 48px;
		font-size: 16px;
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
	.chips {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.chart-card {
		padding: 14px 14px 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.chart-empty {
		margin: 8px 0;
		font-size: 14px;
		line-height: 1.5;
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
	.nothing {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 15px;
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
		.tank-head,
		.title {
			display: none;
		}
		.grid {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 360px;
			gap: 28px;
			align-items: start;
		}
		.cards {
			grid-template-columns: repeat(4, 1fr);
			gap: 12px;
		}
		.cards :global(.pcard) {
			padding: 14px;
		}
		.cards :global(.value) {
			font-size: 28px;
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
