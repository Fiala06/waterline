<script lang="ts">
	// Overview (redesign README → Screens §2): three equal columns with 2px rules
	// between them. Needs attention and In range span two; Due and Recent take the
	// third. Trends and In the tank follow in the same arrangement. The shell has
	// the tank's name, cover and actions; below ~1100px the page is one column.
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ImportButton from '$lib/components/ImportButton.svelte';
	import AttentionList from '$lib/components/AttentionList.svelte';
	import InRangeList from '$lib/components/InRangeList.svelte';
	import TaskList from '$lib/components/TaskList.svelte';
	import RemindMe from '$lib/components/RemindMe.svelte';
	import TrendChart from '$lib/components/TrendChart.svelte';
	import WhatsNew from '$lib/components/WhatsNew.svelte';
	import { compactName, displayValue, fmtRange, fmtValue, paramDecimals, paramUnit, shortName, statusOf } from '$lib/params';
	import { CYCLING_TEXT, cyclingLevel, isCyclingStatus, statusShort } from '$lib/status';
	import Sparkline from '$lib/components/Sparkline.svelte';
	import { enhance } from '$app/forms';
	import { dueInfo, intervalText, isRoutine, routineLine } from '$lib/tasks';
	import { invalidateAll } from '$app/navigation';
	import { discard, retry } from '$lib/offline';
	import { toast, ui } from '$lib/ui.svelte';
	import { photoUrl } from '$lib/media';
	import { hscroll } from '$lib/actions';

	let { data } = $props();
	const prefs = $derived(data.user);

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
			// while the tank is cycling, high ammonia and nitrite are a stage, not a failure
			const cycling = !!data.tank?.cycling;
			const st = cyclingLevel(p.key, statusOf(p, r?.value), cycling);
			const range = fmtRange(p, prefs, false);
			return {
				id: p.id,
				label: shortName(p),
				short: compactName(p),
				fullName: p.name,
				value: r ? fmtValue(p, r.value, prefs) : null,
				unit: paramUnit(p, prefs),
				level: st.level,
				statusText: isCyclingStatus(p.key, st, cycling) ? CYCLING_TEXT : statusShort(st),
				// days since the reading when it's older than its Test every cadence
				due: data.stale?.[p.id] ?? null,
				sub: r ? (range ? `Target ${range}` : 'No target') : 'Not tested',
				// a sensor's latest reading (#19)
				live: data.live?.[p.id] || null,
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
	// what needs attention (out of range, then near a limit), what's fine, what's never been tested
	const attention = $derived([...cards.filter((c) => c.level === 'bad'), ...cards.filter((c) => c.level === 'warn')]);
	const inRange = $derived(cards.filter((c) => c.level === 'ok'));
	const untested = $derived(cards.filter((c) => c.level === 'none').map((c) => c.fullName));
	// "Due a test: KH (23 days), GH (40 days)", longest first
	const dueTests = $derived(cards.filter((c) => c.due != null).map((c) => ({ name: c.fullName, days: c.due! })).sort((a, b) => b.days - a.days));

	const wc = $derived(data.waterChange);
	// the water change needs attention once it's due
	const wcDue = $derived(
		wc && wc.days != null && wc.days >= wc.goal ? { taskId: wc.taskId, days: wc.days, goal: wc.goal, last: wc.last } : null
	);
	// overdue tasks go in Needs attention too, with Done (the water change has its own row)
	const overdue = $derived(
		(data.tasks ?? [])
			.filter((t) => t.due < (data.today ?? '') && !(wcDue && t.id === wcDue.taskId))
			.map((t) => {
				const d = dueInfo(t.due, data.today ?? '');
				return { id: t.id, name: t.name, when: `✕ ${-d.days} day${d.days === -1 ? '' : 's'} over`, sub: isRoutine(t.kind) ? routineLine(t) : intervalText(t) };
			})
	);
	// Due: the water change isn't listed twice when Needs attention has its row (with Done)
	const dueTasks = $derived((data.tasks ?? []).filter((t) => !(wcDue && t.id === wcDue.taskId)));
	// the fun bits only when nothing's out of range or overdue
	const calm = $derived(!cards.some((c) => c.level === 'bad') && !overdue.length && !(wcDue && (wcDue.days > wcDue.goal)));
	const allClear = $derived(hasReadings && !attention.length && !wcDue && !overdue.length);

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
</script>

<svelte:head><title>{data.tank ? `${data.tank.name} · Waterline` : 'Waterline'}</title></svelte:head>

{#if !data.tank}
	<div class="page">
		<h1 class="title hide-desk">Dashboard</h1>
		<EmptyState icon="tank" title="No tanks yet" text="Add your first tank to start logging." href="/tanks/new" label="Add tank" primary />
	</div>
{:else}
	<div class="page">
		<h1 class="sr-only">{data.tank.name} dashboard</h1>

		{#if data.whatsNew}<div class="news"><WhatsNew {...data.whatsNew} /></div>{/if}

		{#if data.cycling}
			<!-- ── Cycling: ammonia, nitrite and nitrate side by side, and where the cycle is ── -->
			<section class="cycling" aria-labelledby="cycling-h">
				<div class="section-head">
					<h2 id="cycling-h">Cycling</h2>
					<a href="/tanks/{data.tank.id}/settings">Setup ›</a>
				</div>
				<div class="cycle-charts">
					{#each data.cycling.charts as c (c.key)}
						<a class="cycle-chart" href="/charts{c.id ? `?p=${c.id}` : ''}" title="{c.name} over the last 8 weeks">
							<span class="cc-name">{c.name}</span>
							<span class="cc-value">{#if c.value != null}{c.value}{#if c.unit}<span class="cc-unit">{c.unit}</span>{/if}{:else}<span class="cc-none">–</span>{/if}</span>
							<span class="cc-spark">{#if c.values.length}<Sparkline values={c.values} level="ok" lo={c.lo} hi={c.hi} />{/if}</span>
							<span class="cc-when">{c.when ?? 'Not tested'}</span>
						</a>
					{/each}
				</div>
				<div class="cycle-foot">
					<p class="stage">{data.cycling.text}</p>
					<form method="POST" action="?/markRunning" use:enhance>
						<input type="hidden" name="tankId" value={data.tank.id} />
						<button class="btn" class:btn-primary={data.cycling.cycled}>Mark as running</button>
					</form>
				</div>
			</section>
		{/if}

		<div class="grid">
			<!-- ── Needs attention (span 2) ─────────────────────────────── -->
			<div class="cell main first">
				{#if !hasReadings}
					<div class="section-head"><h2>Needs attention</h2></div>
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
				{:else if allClear}
					<!-- not a region: there's nothing in it to land on -->
					<div class="section-head"><h2>Needs attention</h2>{#if data.latestWhen}<span class="meta">{data.latestWhen}</span>{/if}</div>
					<p class="clear"><b>✓ Nothing needs attention.</b> <span>Every tracked parameter is in range and no task is overdue.</span></p>
				{:else}
					<AttentionList items={attention} wc={wcDue} {overdue} when={data.latestWhen} />
				{/if}
				{#if hasReadings && calm && data.cheers.milestones.length}
					<ul class="milestones" aria-label="Milestones">
						{#each data.cheers.milestones as m (m.key)}<li>{m.text}</li>{/each}
					</ul>
				{/if}
			</div>

			<!-- ── Due (column 3) ───────────────────────────────────────── -->
			<section class="cell side first" aria-labelledby="due-h">
				<div class="section-head">
					<h2 id="due-h">Due</h2>
					<span class="links"
						><RemindMe tankId={data.tank.id} tankName={data.tank.name} today={data.today} cls="lnk" /><a href="/tasks">All tasks ›</a></span
					>
				</div>
				{#if dueTasks.length}
					<TaskList tasks={dueTasks.slice(0, 3)} today={data.today} />
				{:else}
					<EmptyState
						compact
						icon="maintenance"
						title="Nothing due"
						text="The fish approve. Set up reminders for water changes and upkeep."
						href="/tasks/new?tank={data.tank.id}"
						label="New task"
					/>
				{/if}
			</section>

			<!-- ── In range (span 2) ────────────────────────────────────── -->
			<div class="cell main">
				{#if hasReadings}
					<InRangeList items={inRange} {untested} total={cards.length - untested.length} streak={calm ? data.cheers.streak : null} due={dueTests} testHref="/entries/test/new?tank={data.tank.id}" />
				{:else}
					<div class="section-head"><h2>In range</h2><span class="meta">No readings yet</span></div>
				{/if}
			</div>

			<!-- ── Recent (column 3) ────────────────────────────────────── -->
			<section class="cell side recent" aria-labelledby="recent-h">
				<div class="section-head">
					<h2 id="recent-h">Recent</h2>
					<span class="links"><a href="/photos">Photos</a><a href="/history">History ›</a></span>
				</div>
				<ul class="feed">
					{#each ui.queue.filter((q) => q.tankId === data.tank?.id) as q (q.id)}
						<li>
							<div class="queued">
								<CategoryIcon kind={q.title.startsWith('Water test') ? 'test' : 'note'} size={28} />
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
								<CategoryIcon kind={a.icon} size={28} />
								<span class="f-text">
									<span class="f-title">{a.title}</span>
									<span class="f-sub">{a.sub}</span>
								</span>
								{#if a.thumb}
									<img class="f-thumb" src={photoUrl(a.thumb)} alt="" loading="lazy" />
								{/if}
							</a>
						</li>
					{:else}
						{#if !ui.queue.some((q) => q.tankId === data.tank?.id)}
							<li class="none">Nothing logged yet.</li>
						{/if}
					{/each}
				</ul>
			</section>

			<!-- ── Trends (span 2) ──────────────────────────────────────── -->
			<section class="cell main trends" aria-labelledby="trends-h">
				<div class="section-head">
					<h2 id="trends-h">Trends <span class="meta">· Last 4 weeks</span></h2>
					<a href="/charts{chosen ? `?p=${chosen.id}` : ''}">Charts ›</a>
				</div>
				{#if trendable.length}
					<div class="chips hscroll" role="group" aria-label="Parameter" use:hscroll={chosen?.id}>
						{#each trendable as p (p.id)}
							<button type="button" class="chip" aria-pressed={chosen?.id === p.id} onclick={() => (selected = p.id)}>{shortName(p)}</button>
						{/each}
					</div>
				{/if}
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

			<!-- ── In the tank (column 3) ───────────────────────────────── -->
			<section class="cell side in-tank" aria-labelledby="in-tank-h">
				<div class="section-head">
					<h2 id="in-tank-h">In the tank</h2>
					<a href="/tanks/{data.tank.id}">Details ›</a>
				</div>
				<div class="contents">
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
					{#if data.contents.schedule}
						<a class="c-row" href="/tanks/{data.tank.id}/settings">
							<span class="f-text">
								<span class="f-title">Schedule</span>
								<span class="f-sub">{data.contents.schedule}</span>
							</span>
							<span class="chev" aria-hidden="true">›</span>
						</a>
					{/if}
				</div>
			</section>
		</div>
	</div>
{/if}

<style>
	.page {
		padding: 4px 20px 24px;
		display: flex;
		flex-direction: column;
	}
	.title {
		margin: 12px 0 8px;
		font-size: 28px;
	}
	.news {
		padding: 16px 0 4px;
	}
	/* Cycling: three small charts side by side under the rule, then the stage and Mark as running */
	.cycling {
		display: flex;
		flex-direction: column;
		padding: 18px 0 8px;
	}
	.cycle-charts {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
	}
	.cycle-chart {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		padding: 10px 0 8px;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	.cc-name {
		font-size: 12px;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.cc-value {
		font-size: 22px;
		font-weight: 800;
		line-height: 1.1;
		white-space: nowrap;
	}
	.cc-unit {
		margin-left: 3px;
		font-size: 11px;
		font-weight: 400;
		color: var(--text-muted);
	}
	.cc-none {
		color: var(--text-muted);
	}
	.cc-spark {
		display: block;
		height: 36px;
		margin-top: 4px;
	}
	.cc-when {
		font-size: 12px;
		color: var(--text-muted);
	}
	.cycle-foot {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 12px;
	}
	.stage {
		margin: 0;
		font-size: 15px;
		line-height: 1.45;
	}
	.cycle-foot .btn {
		align-self: flex-start;
		min-height: 44px;
	}
	@media (hover: hover) {
		.cycle-chart:hover {
			background: var(--surface);
			color: var(--text);
		}
	}
	@media (min-width: 1024px) {
		.cycle-charts {
			gap: 32px;
		}
		.cycle-foot {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: 24px;
		}
	}
	/* Phones: one column, top to bottom (the phone design's order), each section under its own rule */
	.grid {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.cell {
		display: flex;
		flex-direction: column;
		min-width: 0;
		padding: 18px 0 8px;
	}
	.cell > :global(.section-head) {
		margin-bottom: 0;
	}
	.cell :global(.section-head) {
		padding-bottom: 8px;
	}
	.links {
		display: flex;
		align-items: baseline;
		gap: 14px;
		font-size: 13px;
	}
	.links a,
	.links :global(.lnk) {
		font-size: 13px;
		font-weight: 800;
		padding: 12px 0;
		margin: -12px 0;
	}
	/* "✓ Nothing needs attention." under the rule */
	.clear {
		margin: 0;
		padding: 18px 0;
		border-bottom: 1px solid var(--divider);
		font-size: 15px;
	}
	.clear span {
		color: var(--text-muted);
	}
	/* chips run to the screen edge on phones */
	.chips {
		margin: 14px -20px 0;
		padding-inline: 20px;
	}
	.chart-box {
		position: relative;
		height: 160px;
		margin-top: 14px;
	}
	.chart-fill {
		position: absolute;
		inset: 0;
	}
	.chart-empty {
		margin: 14px 0 0;
		font-size: 14px;
		line-height: 1.5;
	}
	/* Spotting trends: a line or two under the chart */
	.noticed {
		list-style: none;
		margin: 8px 0 0;
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
		padding: 10px 0;
		text-align: left;
		font-size: 14px;
		line-height: 1.45;
		color: var(--text-2);
		border-bottom: 1px solid var(--divider);
	}
	.arrow {
		flex-shrink: 0;
		width: 16px;
		font-weight: 700;
		color: var(--text-muted);
	}
	button.note[aria-pressed='true'] {
		color: var(--text);
		font-weight: 600;
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
		margin-top: 10px;
		font-size: 13px;
		color: var(--text-2);
	}
	.legend span {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.lg-band {
		width: 16px;
		height: 10px;
		background: var(--band);
	}
	.lg-marker {
		width: 10px;
		height: 10px;
		background: var(--ink);
	}
	/* Recent: a small icon, the title and its line, each row a link */
	.feed {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.feed a,
	.queued {
		display: flex;
		gap: 12px;
		align-items: center;
		min-height: 56px;
		padding: 10px 0;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	.feed :global(.icon) {
		border-radius: 0 !important;
		background: transparent !important;
		color: var(--text) !important;
		flex-shrink: 0;
	}
	@media (hover: hover) {
		.feed a:hover {
			background: var(--surface);
			box-shadow: -8px 0 0 var(--surface);
			color: var(--text);
		}
	}
	.none {
		padding: 14px 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.f-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.f-title {
		font-size: 14px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.f-sub {
		font-size: 12px;
		color: var(--text-muted);
	}
	.chev {
		font-size: 18px;
		color: var(--text-muted);
	}
	.contents {
		display: flex;
		flex-direction: column;
	}
	.c-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 8px 0;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	.c-row .f-title {
		font-size: 15px;
	}
	.c-row .f-sub {
		font-size: 13px;
	}
	@media (hover: hover) {
		.c-row:hover {
			background: var(--surface);
			box-shadow: -8px 0 0 var(--surface);
			color: var(--text);
		}
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
		font-size: 13px;
	}
	.f-thumb {
		width: 36px;
		height: 36px;
		object-fit: cover;
		flex-shrink: 0;
	}
	/* a milestone: the tank's birthday, a pet's anniversary, a round number of tests */
	.milestones {
		list-style: none;
		margin: 0;
		padding: 12px 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 15px;
		font-weight: 600;
		border-bottom: 1px solid var(--divider);
	}

	/* ── Desktop: three equal columns, 2px rules between them ─────────── */
	@media (min-width: 1024px) {
		.page {
			padding: 0 32px 32px;
		}
		.news {
			padding: 24px 0 0;
		}
		.cell {
			padding: 24px 0;
		}
		.cell :global(.section-head) {
			padding-bottom: 10px;
		}
		.chips {
			margin: 14px 0 0;
			padding-inline: 0;
			flex-wrap: wrap;
		}
		.chart-box {
			height: 240px;
		}
	}
	/* two columns beside one (the README's full layout, from ~1100px of window) */
	@media (min-width: 1100px) {
		.grid {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			align-items: start;
		}
		.cell.main {
			grid-column: span 2;
			border-right: 2px solid var(--divider);
			padding-right: 24px;
		}
		.cell.side {
			padding-left: 24px;
		}
		.cell:not(.first) {
			border-top: 2px solid var(--divider);
		}
		.cell.main {
			padding-bottom: 32px;
		}
		.cell.side {
			padding-bottom: 32px;
		}
		/* the side column's cells stretch to the row, so the rules line up */
		.cell {
			align-self: stretch;
		}
	}
	/* below that, one column: the side sections get a top rule instead of a left rule */
	@media (min-width: 1024px) and (max-width: 1099px) {
		.cell:not(.first) {
			border-top: 2px solid var(--divider);
		}
		.cell.side.first {
			border-top: 2px solid var(--divider);
		}
	}
	@media (min-width: 1200px) {
		.cell.main {
			padding-right: 24px;
		}
	}
</style>
