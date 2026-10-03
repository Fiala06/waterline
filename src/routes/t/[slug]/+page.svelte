<script lang="ts">
	// Public, read-only tank page. Phone (P2): one column, readings first.
	// Desktop (P3): cover, story and chart on the left; readings, photos and
	// activity on the right, inside one set of outer margins.
	import Logo from '$lib/components/Logo.svelte';
	import PublicAnalytics from '$lib/components/PublicAnalytics.svelte';
	import PublicHead from '$lib/components/PublicHead.svelte';
	import TrendChart from '$lib/components/TrendChart.svelte';

	let { data } = $props();
	const v = $derived(data.view);
	const photo = (id: string, size: 'thumb' | 'full' = 'thumb') => `/p/${v.slug}/${id}${size === 'thumb' ? '?size=thumb' : ''}`;
	let chartIdx = $state(0);
	const chart = $derived(v.charts[chartIdx] ?? v.charts[0]);
	// the water change a visitor tapped on the chart, for its popover
	let selected = $state<string | null>(null);
	const now = Date.now();
	// The lightbox: a tapped photo opens here, with prev/next through the photos
	// beside it; without scripts the link opens the full-size image instead.
	type Shot = { id: string; date: string };
	let box = $state<HTMLDialogElement>();
	let shots = $state<Shot[]>([]);
	let shot = $state<number | null>(null);
	const current = $derived(shot == null ? null : (shots[shot] ?? null));
	function openShot(e: MouseEvent, list: Shot[], i: number) {
		if (!box?.showModal || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
		e.preventDefault();
		shots = list;
		shot = i;
		box.showModal();
	}
	const step = (d: number) => {
		if (shot != null && shots.length) shot = (shot + d + shots.length) % shots.length;
	};
	// a tap on the dark stage around the photo closes it (the photo, the arrows and the bar don't)
	function onboxclick(e: MouseEvent) {
		const t = e.target as HTMLElement;
		if (t === box || t.classList.contains('lb') || t.classList.contains('lb-stage')) box?.close();
	}
	function onboxkey(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') step(1);
		else if (e.key === 'ArrowLeft') step(-1);
		else return;
		e.preventDefault();
	}
	const gridShots = $derived(v.photos.slice(0, 6));
	const timelineShots = $derived(v.timeline.map((e) => ({ id: e.id, date: e.date })));
	// The timeline stays short: the latest few, the rest behind "Show earlier".
	const TL_SHOW = 6;
	const tlRecent = $derived(v.timeline.slice(-TL_SHOW));
	const tlEarlier = $derived(v.timeline.slice(0, -TL_SHOW));
	// the visitor's ranges are links, so they work without scripts; each keeps the other
	const rangeHref = (patch: Partial<typeof data.ranges>) => {
		const r = { ...data.ranges, ...patch };
		const q = new URLSearchParams();
		if (r.chart !== '90d') q.set('chart', r.chart);
		if (r.log !== 'month') q.set('log', r.log);
		const s = q.toString();
		return `/t/${v.slug}${s ? `?${s}` : ''}`;
	};
	const jsonLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'WebPage',
		name: data.seo.title,
		description: data.seo.description,
		url: data.seo.canonical,
		image: data.seo.image,
		...(v.keeper ? { author: { '@type': 'Person', name: v.keeper } } : {}),
		about: { '@type': 'Thing', name: `${v.name} (${v.type.toLowerCase()} aquarium)` }
	});
	const sub = $derived([v.type, v.volume, v.since ? `running since ${v.since}` : null].filter(Boolean).join(' · '));
	// "today" or "Sep 25"; capitalized where it stands alone
	const testedDay = $derived(v.tested ? v.tested.charAt(0).toUpperCase() + v.tested.slice(1) : null);
	const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '');
	// "Tidewell 200 W" doesn't need "200 W" again
	const specOf = (e: { name: string; spec: string | null }) => (e.spec && !squash(e.name).includes(squash(e.spec)) ? e.spec : null);
	const inTank = $derived(v.livestock.length > 0 || v.plants.length > 0 || v.equipment.length > 0 || v.without.length > 0);
</script>

<PublicHead seo={data.seo} verification={data.verification} {jsonLd} />

<div class="pub">
	<header class="top">
		<div class="top-in">
			<a href="/" class="brand" aria-label="Waterline"><Logo size={24} wordmark wordSize={16} /></a>
			<span class="shared hide-phone">Read-only{v.keeper ? ` · shared by ${v.keeper}` : ''}</span>
			{#if data.ownerTankId}<a class="btn edit" href="/tanks/{data.ownerTankId}/public">Edit public page</a>{/if}
		</div>
	</header>

	<main class="wrap">
		<div class="col">
			<div class="hero" class:photo-placeholder={!v.cover}>
				{#if v.cover}<img src={photo(v.cover, 'full')} alt="{v.name} aquarium" style:object-position={v.coverPos} />{/if}
			</div>

			<div class="intro">
				<div class="title">
					<h1>{v.name}</h1>
					<p class="sub">{sub}{#if v.keeper}<span class="hide-desk">{` · kept by ${v.keeper}`}</span>{/if}</p>
				</div>
				{#if v.summary}
					<div class="pills">
						{#each v.summary.bad as b (b)}<span class="status-tag tag-bad">✕ {b}</span>{/each}
						{#if v.summary.ok}<span class="status-tag tag-ok">✓ {v.summary.ok} in range</span>{/if}
						{#if v.tested}<span class="status-tag tag-none hide-desk">Tested {v.tested}</span>{/if}
					</div>
				{/if}
			</div>

			{#if v.description}<p class="desc">{v.description}</p>{/if}

			{#if chart}
				<section class="chart">
					<div class="ch sh">
						<h2>{chart.name} · {v.ranges.chart.label === 'All' ? 'all time' : `last ${v.ranges.chart.label}`}</h2>
						<nav class="chips" aria-label="Chart range">
							{#each data.chartRanges as r (r.key)}
								<a class="chip" class:selected={data.ranges.chart === r.key} aria-current={data.ranges.chart === r.key ? 'true' : undefined} href={rangeHref({ chart: r.key })}>{r.label}</a>
							{/each}
						</nav>
					</div>
					{#if v.charts.length > 1}
						<div class="chips params" role="group" aria-label="Parameter">
							{#each v.charts as c, i (c.id)}
								<button type="button" class="chip" aria-pressed={chartIdx === i} onclick={() => ((chartIdx = i), (selected = null))}>{c.name}</button>
							{/each}
						</div>
					{/if}
					<div class="chart-card">
						<div class="chart-box">
							<div class="fill">
								<!-- the same chart as the keeper's Charts: points, limits, water changes to tap; dates only -->
								<TrendChart
									fit
									full
									points={chart.points}
									band={chart.band}
									markers={chart.markers}
									sensor={chart.sensor}
									from={v.ranges.chartSince ?? Math.min(now - 30 * 86_400_000, ...chart.points.map((p) => p.t))}
									to={now}
									lastLevel={chart.lastLevel}
									label="{chart.name} over {v.ranges.chart.title}"
									name={chart.name}
									unit={chart.unit}
									decimals={chart.decimals}
									timeZone="UTC"
									times={false}
									{selected}
									onselect={(m) => (selected = selected === m.href ? null : m.href)}
								>
									{#snippet popover(m)}
										{@const full = chart.markers.find((x) => x.href === m.href)}
										<div class="pop-day">{full?.day} · Water change</div>
										<div class="pop-title">{m.label.replace(/^Water change · /, '')}</div>
										{#if full?.change}<div class="pop-change">{full.change}</div>{/if}
									{/snippet}
								</TrendChart>
							</div>
						</div>
						{#if chart.target || chart.markers.length || chart.sensor.length > 1}
							<p class="legend">
								{#if chart.target}<span><i class="swatch" aria-hidden="true"></i>Target band {chart.target}</span>{/if}
								{#if chart.markers.length}<span><i class="swatch marker" aria-hidden="true"></i>Water change</span>{/if}
								{#if chart.sensor.length > 1}<span><i class="swatch sensor" aria-hidden="true"></i>Sensor</span>{/if}
							</p>
						{/if}
					</div>
				</section>
			{/if}

			{#if inTank}
				<section class="tank">
					<div class="sh"><h2>In the tank</h2></div>
					{#if v.livestock.length}
						<div class="group">
							<h3>Livestock</h3>
							<ul class="tags">
								{#each v.livestock as l (l.id)}<li class="tag">{l.name}{#if l.count != null}<b class="num">{l.count}</b>{/if}</li>{/each}
							</ul>
						</div>
					{/if}
					{#if v.equipment.length || v.without.length}
						<div class="group">
							<h3>Equipment</h3>
							<ul class="rows">
								{#each v.equipment as e (e.id)}
									<li><span>{e.name}</span>{#if specOf(e)}<span class="muted">{specOf(e)}</span>{/if}</li>
								{/each}
								{#each v.without as w (w)}
									<li><span>{w}</span><span class="muted">None</span></li>
								{/each}
							</ul>
						</div>
					{/if}
					{#if v.plants.length}
						<div class="group">
							<h3>Plants</h3>
							<p class="plants">{v.plants.join(', ')}</p>
						</div>
					{/if}
				</section>
			{/if}
		</div>

		<div class="col side">
			{#if v.readings.length}
				<section class="readings">
					<!-- P2 goes straight from the pills to the tiles; the heading is for desktop and screen readers -->
					<div class="sh">
						<h2>Latest readings</h2>
						{#if testedDay}<span class="muted">{testedDay}</span>{/if}
					</div>
					<div class="tiles">
						{#each v.readings as r (r.id)}
							<div class="rd" class:bad={r.level === 'bad'} class:warn={r.level === 'warn'}>
								<span class="rn">{r.name}</span>
								<span class="rv num">{r.value}{#if r.unit}{' '}<small>{r.unit}</small>{/if}</span>
								<span class="rs status-{r.level}">{r.status}</span>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			{#if v.photos.length}
				<section class="photos">
					<div class="sh"><h2>Photos</h2></div>
					<div class="grid">
						{#each gridShots as p, i (p.id)}
							<a href={photo(p.id, 'full')} onclick={(e) => openShot(e, gridShots, i)}><img src={photo(p.id)} alt="{v.name} on {p.date}" loading="lazy" /></a>
						{/each}
					</div>
				</section>
			{/if}

			{#if v.timeline.length}
				<section class="timeline">
					<div class="sh"><h2>Timeline</h2></div>
					<!-- compact rows: a small shot, the date and the day's facts on one line, the readings under it -->
					{#snippet entries(list: typeof v.timeline, offset: number)}
						{#each list as e, i (e.id)}
							{#if e.gap}
								<li class="tl-gap"><b>{e.gap.label}</b>{e.gap.summary ? ` · ${e.gap.summary}` : ''}</li>
							{/if}
							<li class="tl-entry">
								<a class="tl-shot" href={photo(e.id, 'full')} onclick={(ev) => openShot(ev, timelineShots, offset + i)}><img src={photo(e.id)} alt="{v.name} on {e.date}" loading="lazy" /></a>
								<div class="tl-info">
									<span class="tl-line">
										<span class="tl-date">{e.date}</span>
										{#if e.dayNumber || e.animals || e.plants}
											<span class="muted tl-stats">
												{' · ' +
													[e.dayNumber ? `Day ${e.dayNumber}` : null, e.animals ? `${e.animals} animal${e.animals === 1 ? '' : 's'}` : null, e.plants ? `${e.plants} plant${e.plants === 1 ? '' : 's'}` : null]
														.filter(Boolean)
														.join(' · ')}
											</span>
										{/if}
									</span>
									<!-- a second photo on the same day shares the entry above's readings: once is enough -->
									{#if e.readings?.length && e.gap?.days !== 0}
										<ul class="tl-readings">
											{#each e.readings as r (r.name)}
												<li><span class="muted">{r.name}</span> <span class="num">{r.value}{r.unit ? ` ${r.unit}` : ''}</span> <span class="rs status-{r.level}">{r.status}</span></li>
											{/each}
										</ul>
									{/if}
								</div>
							</li>
						{/each}
					{/snippet}
					<ol class="tl">
						{#if tlEarlier.length}
							<li class="tl-more">
								<details>
									<summary>Show {tlEarlier.length} earlier<span class="chev" aria-hidden="true">▾</span></summary>
									<ol class="tl">{@render entries(tlEarlier, 0)}</ol>
								</details>
							</li>
						{/if}
						{@render entries(tlRecent, tlEarlier.length)}
					</ol>
				</section>
			{/if}

			{#if v.activity.length || data.ranges.log !== 'month'}
				<section class="activity">
					<div class="sh ch">
						<h2>Log</h2>
						<nav class="chips" aria-label="Log range">
							{#each data.logRanges as r (r.key)}
								<a class="chip" class:selected={data.ranges.log === r.key} aria-current={data.ranges.log === r.key ? 'true' : undefined} href={rangeHref({ log: r.key })}>{r.label}</a>
							{/each}
						</nav>
					</div>
					{#if v.activity.length}
						<ul class="rows">
							{#each v.activity as a (a.key)}
								{#if a.readings?.length}
									<!-- a water test opens to its readings; <details> works without scripts -->
									<li class="test">
										<details>
											<summary><span class="t-title">{a.title}<span class="chev" aria-hidden="true">▾</span></span><span class="muted">{a.day}</span></summary>
											<ul class="t-readings">
												{#each a.readings as r (r.name)}
													<li><span>{r.name}</span><span class="num">{r.value}{r.unit ? ` ${r.unit}` : ''}</span><span class="rs status-{r.level}">{r.status}</span></li>
												{/each}
											</ul>
										</details>
									</li>
								{:else}
									<li><span>{a.title}</span><span class="muted">{a.day}</span></li>
								{/if}
							{/each}
						</ul>
					{:else}
						<p class="muted none">Nothing logged in this range.</p>
					{/if}
				</section>
			{/if}
		</div>

		<footer class="foot"><Logo size={18} />Logged with Waterline · read-only</footer>
	</main>
</div>

<!-- The lightbox: the photo on a dark stage, its date, prev/next, Esc or a tap outside to close -->
<dialog class="lightbox" bind:this={box} aria-label="Photo" onclose={() => (shot = null)} onclick={onboxclick} onkeydown={onboxkey}>
	{#if current}
		<div class="lb">
			<div class="lb-stage"><img src={photo(current.id, 'full')} alt="{v.name} on {current.date}" /></div>
			{#if shots.length > 1}
				<button type="button" class="lb-nav lb-prev" onclick={() => step(-1)} aria-label="Previous photo">‹</button>
				<button type="button" class="lb-nav lb-next" onclick={() => step(1)} aria-label="Next photo">›</button>
			{/if}
			<div class="lb-bar">
				<span class="lb-cap">{current.date}{shots.length > 1 ? ` · ${(shot ?? 0) + 1} of ${shots.length}` : ''}</span>
				<a class="lb-full" href={photo(current.id, 'full')} target="_blank" rel="noopener">Full size ↗</a>
				<button type="button" class="lb-close" onclick={() => box?.close()} aria-label="Close">✕</button>
			</div>
		</div>
	{/if}
</dialog>

<PublicAnalytics ga4Id={data.analytics.ga4Id} consent={data.analytics.consent} />

<style>
	.pub {
		min-height: 100dvh;
		background: var(--bg);
		color: var(--text);
	}

	/* ── Header ───────────────────────────────────────────────── */
	.top {
		border-bottom: 2px solid var(--divider);
		padding-top: env(safe-area-inset-top);
	}
	.top-in {
		max-width: 1280px;
		margin: 0 auto;
		min-height: 56px;
		padding: 0 20px;
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin-right: auto;
		color: var(--text);
	}
	.shared {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.edit {
		min-height: 36px;
		padding: 0 14px;
		font-size: 13px;
	}

	/* ── Layout ───────────────────────────────────────────────── */
	.wrap {
		max-width: 1280px;
		margin: 0 auto;
		padding: 0 20px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 28px;
		min-width: 0;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}
	/* a heading over a 2px ink rule, its meta on the right */
	.sh {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		padding-bottom: 8px;
		border-bottom: 2px solid var(--ink);
	}
	h2 {
		margin: 0;
		font-size: 20px;
	}
	/* Phones: one column: cover, title, readings, chart, photos, the tank, activity. */
	@media (max-width: 1023px) {
		.col {
			display: contents;
		}
		.hero {
			order: 0;
		}
		.intro {
			order: 1;
		}
		.desc {
			order: 2;
		}
		.readings {
			order: 3;
		}
		.chart {
			order: 4;
		}
		.photos {
			order: 5;
		}
		.timeline {
			order: 6;
		}
		.tank {
			order: 7;
		}
		.activity {
			order: 8;
		}
		.foot {
			order: 9;
		}
	}
	/* ── Timeline (#26) ─────────────────────────────────────── */
	.tl {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tl-entry {
		display: grid;
		grid-template-columns: 56px minmax(0, 1fr);
		gap: 10px;
		align-items: start;
		padding: 6px 0;
		border-bottom: 1px solid var(--divider);
	}
	.tl-shot {
		display: block;
		width: 56px;
		height: 56px;
	}
	.tl-shot img {
		display: block;
		width: 56px;
		height: 56px;
		object-fit: cover;
		background: var(--surface);
	}
	.tl-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		padding-top: 2px;
	}
	.tl-line {
		font-size: 14px;
		line-height: 1.3;
	}
	.tl-date {
		font-weight: 800;
	}
	.tl-stats {
		font-size: 13px;
	}
	.tl-readings {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0 12px;
		font-size: 12px;
		line-height: 1.5;
	}
	.tl-readings .num {
		font-weight: 700;
	}
	.tl-readings .rs {
		font-size: 11px;
		font-weight: 700;
	}
	.tl-gap {
		padding: 3px 0 3px 10px;
		border-left: 2px solid var(--ink);
		margin: 4px 0;
		font-size: 12px;
		line-height: 1.4;
		color: var(--text-2);
	}
	/* the earlier entries fold away behind one row */
	.tl-more summary {
		display: flex;
		align-items: center;
		min-height: 44px;
		cursor: pointer;
		list-style: none;
		font-size: 14px;
		font-weight: 700;
		border-bottom: 1px solid var(--divider);
	}
	.tl-more summary::-webkit-details-marker {
		display: none;
	}
	.tl-more details[open] > summary {
		margin-bottom: 4px;
	}
	.tl-more details[open] .chev {
		transform: rotate(180deg);
	}

	/* ── Cover + title ────────────────────────────────────────── */
	.hero {
		position: relative;
		height: 220px;
		margin: 0 -20px;
		overflow: hidden;
		border: none;
	}
	.hero img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.intro {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.title {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	h1 {
		margin: 0;
		font-size: 34px;
		letter-spacing: -0.02em;
		line-height: 1.05;
		overflow-wrap: anywhere;
	}
	.sub {
		margin: 0;
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.desc {
		margin: 0;
		font-size: 15px;
		line-height: 1.6;
		max-width: 640px;
	}

	/* ── Readings ─────────────────────────────────────────────── */
	.sh .muted {
		font-size: 13px;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border-top: 2px solid var(--ink);
	}
	@media (min-width: 1024px) {
		.tiles {
			border-top: none;
		}
	}
	.rd {
		padding: 8px 10px 8px 0;
		display: grid;
		grid-template-areas: 'n' 'v' 's';
		align-content: start;
		gap: 2px;
		min-width: 0;
		border-bottom: 1px solid var(--divider);
	}
	.rn {
		grid-area: n;
		font-size: 12px;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rv {
		grid-area: v;
		font-size: 22px;
		font-weight: 800;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}
	.rv small {
		font-size: 11px;
		font-weight: 400;
		color: var(--text-muted);
	}
	.rs {
		grid-area: s;
		font-size: 12px;
		font-weight: 800;
		white-space: nowrap;
	}
	/* a reading out of range reads in red; near, in neutral-800 (never colour alone) */
	.rd.bad .rv {
		color: var(--bad);
	}

	/* ── Chart ────────────────────────────────────────────────── */
	.ch {
		flex-wrap: wrap;
		gap: 8px 12px;
	}
	.ch .chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.ch .chip {
		height: 30px;
		padding: 0 10px;
		font-size: 13px;
	}
	.ch .chip::after {
		inset: -7px 0;
	}
	.chips.params {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 10px;
	}
	.chips.params .chip {
		height: 30px;
		padding: 0 10px;
		font-size: 13px;
	}
	.none {
		margin: 8px 0 0;
		font-size: 14px;
	}
	.chart-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	/* room for the points, the limit labels and the Date title under the axis */
	.chart-box {
		position: relative;
		height: 200px;
	}
	.fill {
		position: absolute;
		inset: 0;
	}
	.legend {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		column-gap: 16px;
		row-gap: 4px;
		font-size: 12px;
		color: var(--text-muted);
	}
	.legend > span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.swatch {
		width: 14px;
		height: 8px;
		background: var(--band);
	}
	.swatch.marker {
		width: 8px;
		height: 8px;
		background: var(--ink);
	}
	.swatch.sensor {
		width: 14px;
		height: 0;
		border-top: 1.5px solid var(--neutral-600);
		background: none;
	}
	/* a tapped water change's popover, as on the keeper's Charts */
	:global(.pub .pop-day) {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	:global(.pub .pop-title) {
		font-size: 14px;
		font-weight: 800;
	}
	:global(.pub .pop-change) {
		font-size: 12px;
		color: var(--text-2);
	}

	/* ── Photos ───────────────────────────────────────────────── */
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 4px;
	}
	.grid a {
		display: block;
		aspect-ratio: 1;
		overflow: hidden;
		background: var(--surface);
	}
	.grid img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	/* ── In the tank ──────────────────────────────────────────── */
	.group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	h3 {
		margin: 4px 0 0;
		font-size: 11px;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.tags {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tag {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		padding: 0 10px;
		background: var(--surface);
		font-size: 13px;
	}
	.tag b {
		font-weight: 800;
	}
	.plants {
		margin: 0;
		font-size: 14px;
		line-height: 1.6;
	}

	/* Equipment and activity: label left, detail right, 1px dividers */
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.rows li {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 16px;
		padding: 10px 0;
		font-size: 15px;
		border-bottom: 1px solid var(--divider);
	}
	.rows .muted {
		flex-shrink: 0;
		text-align: right;
		font-size: 13px;
	}
	.tank .rows li {
		padding: 8px 0;
		font-size: 14px;
	}
	/* a water test in the log opens to its readings */
	.rows li.test {
		display: block;
		padding: 0;
	}
	.test summary {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 16px;
		min-height: 44px;
		padding: 10px 0;
		box-sizing: border-box;
		cursor: pointer;
		list-style: none;
	}
	.test summary::-webkit-details-marker {
		display: none;
	}
	.test summary:hover .t-title {
		text-decoration: underline;
	}
	.chev {
		display: inline-block;
		margin-left: 6px;
		font-size: 11px;
		color: var(--text-muted);
		transition: transform 0.15s;
	}
	.test details[open] .chev {
		transform: rotate(180deg);
	}
	.t-readings {
		list-style: none;
		margin: 0 0 10px;
		padding: 0;
		border-top: 1px solid var(--divider);
	}
	.rows .t-readings li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto 7.5em;
		gap: 12px;
		padding: 6px 0 6px 12px;
		font-size: 14px;
		border-bottom: 1px solid var(--divider);
	}
	.rows .t-readings li:last-child {
		border-bottom: none;
	}
	.t-readings .num {
		font-weight: 700;
		text-align: right;
	}
	.t-readings .rs {
		grid-area: auto;
		text-align: right;
	}
	/* ── Lightbox ─────────────────────────────────────────────── */
	.lightbox {
		width: 100vw;
		max-width: 100vw;
		height: 100dvh;
		max-height: 100dvh;
		margin: 0;
		padding: 0;
		border: none;
		background: var(--viewer-bg);
		color: var(--overlay-text);
	}
	.lightbox::backdrop {
		background: rgba(0, 0, 0, 0.6);
	}
	.lb {
		position: relative;
		height: 100%;
		display: flex;
		flex-direction: column;
	}
	.lb-stage {
		flex: 1 1 0;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: calc(12px + env(safe-area-inset-top)) 12px 12px;
	}
	.lb-stage img {
		display: block;
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		object-fit: contain;
	}
	.lb-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 44px;
		height: 44px;
		border: 1px solid var(--divider);
		border-radius: 0;
		background: var(--surface);
		color: var(--text-2);
		font-size: 22px;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.lb-prev {
		left: 12px;
	}
	.lb-next {
		right: 12px;
	}
	.lb-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 0 12px calc(env(safe-area-inset-bottom));
		background: var(--surface);
		color: var(--text);
		border-top: 2px solid var(--ink);
	}
	.lb-cap {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.lb-full {
		font-size: 13px;
		font-weight: 700;
		color: var(--text);
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.lb-close {
		width: 44px;
		height: 44px;
		border: 1px solid var(--divider);
		border-radius: 0;
		background: var(--bg);
		color: var(--text);
		font-size: 16px;
		cursor: pointer;
	}
	@media (hover: hover) {
		.lb-nav:hover,
		.lb-close:hover {
			background: var(--surface-hi);
			color: var(--text);
		}
	}

	/* ── Footer ───────────────────────────────────────────────── */
	.foot {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 2px;
		padding: 12px 0 calc(30px + env(safe-area-inset-bottom));
		border-top: 2px solid var(--ink);
		font-size: 13px;
		color: var(--text-muted);
	}

	/* ── Desktop ──────────────────────────────────────────────── */
	@media (min-width: 1024px) {
		.top-in {
			min-height: 60px;
			padding: 0 40px;
		}
		.wrap {
			display: grid;
			grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
			gap: 32px;
			align-items: start;
			padding: 32px 40px 0;
		}
		/* the side column sits beyond a 2px rule */
		.side {
			gap: 24px;
			padding-left: 32px;
			border-left: 2px solid var(--divider);
		}
		.hero {
			height: 320px;
			margin: 0;
		}
		.intro {
			flex-direction: row;
			justify-content: space-between;
			align-items: flex-end;
			gap: 20px;
		}
		.title {
			flex: 1;
		}
		h1 {
			font-size: 42px;
		}
		.pills {
			justify-content: flex-end;
			max-width: 50%;
		}
		.desc {
			font-size: 16px;
		}
		.chart-box {
			height: 250px;
		}
		.tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.rd {
			padding: 10px 12px 10px 0;
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas: 'n s' 'v v';
			column-gap: 6px;
		}
		.rn,
		.rs {
			font-size: 13px;
		}
		.rv {
			font-size: 26px;
		}
		.rv small {
			font-size: 12px;
		}
		.grid {
			gap: 6px;
		}
		.rows li {
			padding: 9px 0;
			font-size: 14px;
		}
		.foot {
			grid-column: 1 / -1;
			margin-top: 16px;
			padding-bottom: 40px;
		}
	}
</style>
