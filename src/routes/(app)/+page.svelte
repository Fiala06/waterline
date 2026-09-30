<script lang="ts">
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import AccountMenu from '$lib/components/AccountMenu.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ImportButton from '$lib/components/ImportButton.svelte';
	import AttentionList from '$lib/components/AttentionList.svelte';
	import InRangeList from '$lib/components/InRangeList.svelte';
	import TankHero from '$lib/components/TankHero.svelte';
	import TaskList from '$lib/components/TaskList.svelte';
	import RemindMe from '$lib/components/RemindMe.svelte';
	import TrendChart from '$lib/components/TrendChart.svelte';
	import WhatsNew from '$lib/components/WhatsNew.svelte';
	import { compactName, displayValue, fmtRange, fmtValue, paramDecimals, paramUnit, shortName, statusOf } from '$lib/params';
	import { statusShort } from '$lib/status';
	import { invalidateAll } from '$app/navigation';
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
				spark: data.sparks?.[p.id] ?? [],
				// the target band behind its line (stored units, as the readings)
				lo: p.min,
				hi: p.max,
				key: p.key
			};
		})
	);
	const hasReadings = $derived(cards.some((c) => c.value != null));
	// Refresh (1c): what needs attention (out of range, then near a limit), what's fine, what's never been tested
	const attention = $derived([...cards.filter((c) => c.level === 'bad'), ...cards.filter((c) => c.level === 'warn')]);
	const inRange = $derived(cards.filter((c) => c.level === 'ok'));
	const untested = $derived(cards.filter((c) => c.level === 'none').map((c) => c.fullName));

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
	// the water change needs attention once it's due
	const wcDue = $derived(wc && wc.days != null && wc.days >= wc.goal ? { days: wc.days, goal: wc.goal, last: wc.last } : null);
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
		<TankHero
			tank={data.tank}
			tanks={data.tanks}
			cover={current?.cover}
			coverPos={current?.coverPos}
			volume={current?.volume}
			today={data.today}
			lastTest={data.latestWhen ? `Last test ${data.latestWhen}` : 'No tests yet'}
			user={data.user}
		/>

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
					{#if attention.length || wcDue}
						<AttentionList items={attention} wc={wcDue} when={data.latestWhen} />
					{/if}
					<InRangeList items={inRange} {untested} total={cards.length - untested.length} />

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
	/* Phones read top to bottom (refresh 1c): attention, in range, due, trends, recent activity, in the tank. */
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
	}
</style>
