<script lang="ts">
	// Public, read-only tank page. Phone (P2): one column, readings first.
	// Desktop (P3): cover, story and chart on the left; readings, photos and
	// activity on the right, inside one set of outer margins.
	import Logo from '$lib/components/Logo.svelte';
	import PublicAnalytics from '$lib/components/PublicAnalytics.svelte';
	import PublicHead from '$lib/components/PublicHead.svelte';
	import TrendChart from '$lib/components/TrendChart.svelte';
	import { fmtDate } from '$lib/time';
	import { formatNumber } from '$lib/units';

	let { data } = $props();
	const v = $derived(data.view);
	const photo = (id: string, size: 'thumb' | 'full' = 'thumb') => `/p/${v.slug}/${id}${size === 'thumb' ? '?size=thumb' : ''}`;
	let chartIdx = $state(0);
	const chart = $derived(v.charts[chartIdx] ?? v.charts[0]);
	const now = Date.now();
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
	const inTank = $derived(v.livestock.length > 0 || v.plants.length > 0 || v.equipment.length > 0);
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
				{#if v.cover}<img src={photo(v.cover, 'full')} alt="{v.name} aquarium" />{/if}
			</div>

			<div class="intro">
				<div class="title">
					<h1>{v.name}</h1>
					<p class="sub">{sub}{#if v.keeper}<span class="hide-desk">{` · kept by ${v.keeper}`}</span>{/if}</p>
				</div>
				{#if v.summary}
					<div class="pills">
						{#each v.summary.bad as b (b)}<span class="pill bad">✕ {b}</span>{/each}
						{#if v.summary.ok}<span class="pill ok">✓ {v.summary.ok} in range</span>{/if}
						{#if v.tested}<span class="pill plain hide-desk">Tested {v.tested}</span>{/if}
					</div>
				{/if}
			</div>

			{#if v.description}<p class="desc">{v.description}</p>{/if}

			{#if chart}
				<section class="chart">
					<div class="ch">
						<h2>{chart.name} · 3 months</h2>
						{#if v.charts.length > 1}
							<div class="chips" role="group" aria-label="Parameter">
								{#each v.charts as c, i (c.id)}
									<button type="button" class="chip" aria-pressed={chartIdx === i} onclick={() => (chartIdx = i)}>{c.name}</button>
								{/each}
							</div>
						{/if}
					</div>
					<div class="chart-card">
						<div class="chart-box">
							<div class="fill">
								<TrendChart
									fit
									points={chart.points}
									band={chart.band}
									from={now - 91 * 86_400_000}
									to={now}
									lastLevel={chart.lastLevel}
									label="{chart.name} over the last 3 months"
									name={chart.name}
									unit={chart.unit}
									format={(v) => formatNumber(v, chart.decimals)}
									when={(t) => fmtDate(new Date(t).toISOString().slice(0, 10))}
								/>
							</div>
						</div>
						{#if chart.target}<p class="legend"><span class="swatch" aria-hidden="true"></span>Target {chart.target}</p>{/if}
					</div>
				</section>
			{/if}

			{#if inTank}
				<section class="tank">
					<h2>In the tank</h2>
					{#if v.livestock.length}
						<div class="group">
							<h3>Livestock</h3>
							<ul class="tags">
								{#each v.livestock as l (l.id)}<li class="tag">{l.name}<b class="num">{l.count}</b></li>{/each}
							</ul>
						</div>
					{/if}
					{#if v.equipment.length}
						<div class="group">
							<h3>Equipment</h3>
							<ul class="rows">
								{#each v.equipment as e (e.id)}
									<li><span>{e.name}</span>{#if specOf(e)}<span class="muted">{specOf(e)}</span>{/if}</li>
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
					<h2>Photos</h2>
					<div class="grid">
						{#each v.photos.slice(0, 6) as p, i (p)}
							<a href={photo(p, 'full')}><img src={photo(p)} alt="{v.name} photo {i + 1}" loading="lazy" /></a>
						{/each}
					</div>
				</section>
			{/if}

			{#if v.activity.length}
				<section class="activity">
					<h2>Recent activity</h2>
					<ul class="rows">
						{#each v.activity as a (a.key)}<li><span>{a.title}</span><span class="muted">{a.day}</span></li>{/each}
					</ul>
				</section>
			{/if}
		</div>

		<footer class="foot"><Logo size={18} />Logged with Waterline · read-only</footer>
	</main>
</div>

<PublicAnalytics ga4Id={data.analytics.ga4Id} consent={data.analytics.consent} />

<style>
	.pub {
		min-height: 100dvh;
		background: var(--bg);
		color: var(--text);
	}

	/* ── Header ───────────────────────────────────────────────── */
	.top {
		border-bottom: 1px solid var(--border);
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
		font-size: 13px;
		color: var(--text-muted);
	}
	.edit {
		position: relative;
		min-height: 36px;
		padding: 0 14px;
		border-radius: 10px;
		font-size: 14px;
	}
	.edit::after {
		content: '';
		position: absolute;
		inset: -4px 0;
	}

	/* ── Layout ───────────────────────────────────────────────── */
	.wrap {
		max-width: 1280px;
		margin: 0 auto;
		padding: 0 20px;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 24px;
		min-width: 0;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	/* Phones (P2): one column: cover, title, readings, chart, photos, the tank, activity. */
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
		.tank {
			order: 6;
		}
		.activity {
			order: 7;
		}
		.foot {
			order: 8;
		}
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
	/* the cover fades into the page and the title overlaps it (P2) */
	.hero::after {
		content: '';
		position: absolute;
		inset: auto 0 0;
		height: 90px;
		background: linear-gradient(transparent, var(--bg));
	}
	.intro {
		position: relative;
		margin-top: -50px;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.title {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	h1 {
		margin: 0;
		font-size: 30px;
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}
	.sub {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		height: 30px;
		padding: 0 10px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
	}
	.pill.bad {
		background: var(--bad-bg);
		color: var(--bad-text);
	}
	.pill.ok {
		background: var(--ok-bg);
		color: var(--ok-text);
	}
	.pill.plain {
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text-2);
		font-weight: 400;
	}
	.desc {
		margin: 0;
		font-size: 15px;
		line-height: 1.6;
		color: var(--text-2);
		max-width: 640px;
	}

	/* ── Readings ─────────────────────────────────────────────── */
	.sh {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		font-size: 13px;
	}
	@media (max-width: 1023px) {
		.sh {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
			white-space: nowrap;
		}
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	.rd {
		border-radius: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		padding: 10px;
		display: grid;
		grid-template-areas: 'n' 'v' 's';
		align-content: start;
		gap: 4px;
		min-width: 0;
	}
	.rd.bad {
		background: var(--bad-bg);
		border-color: var(--bad-border);
	}
	.rd.warn {
		background: var(--warn-bg);
		border-color: var(--warn-border);
	}
	.rn {
		grid-area: n;
		font-size: 12px;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rd.bad .rn,
	.rd.bad small {
		color: var(--bad-text);
	}
	.rd.warn .rn,
	.rd.warn small {
		color: var(--warn-text);
	}
	.rv {
		grid-area: v;
		font-size: 22px;
		font-weight: 600;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}
	.rv small {
		font-size: 12px;
		font-weight: 400;
		color: var(--text-muted);
	}
	.rs {
		grid-area: s;
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
	}

	/* ── Chart ────────────────────────────────────────────────── */
	.ch {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 12px;
		justify-content: space-between;
		align-items: center;
	}
	.ch .chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.ch .chip[aria-pressed='true'] {
		font-weight: 700;
	}
	.chart-card {
		border-radius: 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.chart-box {
		position: relative;
		height: 150px;
	}
	.fill {
		position: absolute;
		inset: 0;
	}
	.legend {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--text-muted);
	}
	.swatch {
		width: 14px;
		height: 8px;
		background: var(--band);
		border: 1px dashed var(--accent);
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
		border-radius: 6px;
		overflow: hidden;
		background: var(--surface-hi);
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
		font-size: 12px;
		font-weight: 600;
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
		border-radius: 8px;
		background: var(--surface);
		border: 1px solid var(--border);
		font-size: 13px;
	}
	.tag b {
		color: var(--accent);
	}
	.plants {
		margin: 0;
		font-size: 14px;
		line-height: 1.6;
		color: var(--text-2);
	}

	/* Equipment and activity: label left, detail right, soft dividers */
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
	}
	.rows li + li {
		border-top: 1px solid var(--divider-soft);
	}
	.rows .muted {
		flex-shrink: 0;
		text-align: right;
	}
	.tank .rows li {
		padding: 8px 0;
		font-size: 14px;
	}
	/* ── Footer ───────────────────────────────────────────────── */
	.foot {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 2px;
		padding: 12px 0 calc(30px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--border);
		font-size: 13px;
		color: var(--text-muted);
	}

	/* ── Desktop (P3) ─────────────────────────────────────────── */
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
		.side {
			gap: 22px;
		}
		.hero {
			height: 320px;
			margin: 0;
			border-radius: 18px;
		}
		.hero::after {
			display: none;
		}
		.intro {
			margin-top: 0;
			flex-direction: row;
			justify-content: space-between;
			align-items: flex-end;
			gap: 20px;
		}
		.title {
			flex: 1;
		}
		h1 {
			font-size: 40px;
			letter-spacing: -0.02em;
		}
		.sub {
			font-size: 15px;
		}
		.pills {
			justify-content: flex-end;
			max-width: 50%;
		}
		.pill {
			height: 32px;
			padding: 0 12px;
		}
		.desc {
			font-size: 16px;
		}
		/* the chart header moves into the card */
		.chart {
			border-radius: 16px;
			background: var(--surface);
			border: 1px solid var(--border);
			padding: 18px;
		}
		.chart-card {
			border: none;
			border-radius: 0;
			background: none;
			padding: 0;
		}
		.chart-box {
			height: 200px;
		}
		/* P3's compact chips (phones keep the 36px ones) */
		.ch .chip {
			height: 30px;
			padding: 0 12px;
			border-radius: 15px;
			font-size: 13px;
		}
		.ch .chip::after {
			inset: -7px 0;
		}
		.tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.rd {
			padding: 12px;
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas: 'n s' 'v v';
			column-gap: 6px;
		}
		.rn,
		.rs {
			font-size: 13px;
		}
		.rv {
			font-size: 24px;
		}
		.rv small {
			font-size: 13px;
		}
		.grid {
			gap: 6px;
		}
		.grid a {
			border-radius: 8px;
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
