<script lang="ts">
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import PublicAnalytics from '$lib/components/PublicAnalytics.svelte';
	import PublicHead from '$lib/components/PublicHead.svelte';
	import TrendChart from '$lib/components/TrendChart.svelte';
	import type { ComponentProps } from 'svelte';

	let { data } = $props();
	const v = $derived(data.view);
	const photo = (id: string, size: 'thumb' | 'full' = 'thumb') => `/p/${v.slug}/${id}${size === 'thumb' ? '?size=thumb' : ''}`;
	let chartIdx = $state(0);
	const chart = $derived(v.charts[chartIdx] ?? v.charts[0]);
	const now = Date.now();
	const kind = (k: string) => (k === 'test' ? 'test' : k) as ComponentProps<typeof CategoryIcon>['kind'];
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
</script>

<PublicHead seo={data.seo} verification={data.verification} {jsonLd} />

<div class="pub">
	<header class="top">
		<a href="/" class="brand" aria-label="Waterline"><Logo size={26} wordmark wordSize={18} /></a>
		<span class="muted sm">Read-only{v.keeper ? ` · shared by ${v.keeper}` : ''}</span>
		{#if data.ownerTankId}<a class="btn sm-btn" href="/tanks/{data.ownerTankId}/public">Edit public page</a>{/if}
	</header>

	<div class="hero" class:photo-placeholder={!v.cover}>
		{#if v.cover}<img src={photo(v.cover, 'full')} alt="{v.name} aquarium" />{/if}
	</div>

	<main class="wrap">
		<div class="intro">
			<h1>{v.name}</h1>
			<p class="muted">{sub}{v.keeper ? ` · kept by ${v.keeper}` : ''}</p>
			{#if v.summary}
				<div class="pills">
					{#each v.summary.bad as b (b)}<span class="pill bad">✕ {b}</span>{/each}
					{#if v.summary.ok}<span class="pill ok">✓ {v.summary.ok} in range</span>{/if}
					{#if v.tested}<span class="muted sm">Tested {v.tested}</span>{/if}
				</div>
			{/if}
			{#if v.description}<p class="desc">{v.description}</p>{/if}
		</div>

		<div class="cols">
			<div class="col">
				{#if chart}
					<section class="card chart">
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
						<TrendChart
							full
							height={220}
							points={chart.points}
							band={chart.band}
							from={now - 91 * 86_400_000}
							to={now}
							lastLevel={chart.lastLevel}
							label="{chart.name} over the last 3 months"
						/>
						{#if chart.target}<p class="muted sm">Target {chart.target}</p>{/if}
					</section>
				{/if}

				{#if v.photos.length}
					<section>
						<h2>Photos</h2>
						<div class="photos">
							{#each v.photos as p, i (p)}<a href={photo(p, 'full')}><img src={photo(p)} alt="{v.name} photo {i + 1}" loading="lazy" /></a>{/each}
						</div>
					</section>
				{/if}

				{#if v.livestock.length || v.plants.length || v.equipment.length}
					<section>
						<h2>In the tank</h2>
						{#if v.livestock.length}
							<div class="card list">
								{#each v.livestock as l (l.id)}<div class="li"><span>{l.name}</span><span class="num strong">{l.count}</span></div>{/each}
							</div>
						{/if}
						{#if v.equipment.length}
							<p class="muted sm">{v.equipment.map((e) => [e.name, e.spec].filter(Boolean).join(' ')).join(' · ')}</p>
						{/if}
						{#if v.plants.length}<p class="muted sm">{v.plants.join(', ')}</p>{/if}
					</section>
				{/if}
			</div>

			<div class="col side">
				{#if v.readings.length}
					<section class="first">
						<div class="sh"><h2>Latest readings</h2>{#if v.tested}<span class="muted sm">{v.tested}</span>{/if}</div>
						<div class="readings">
							{#each v.readings as r (r.id)}
								<div class="card rd" class:bad={r.level === 'bad'} class:warn={r.level === 'warn'}>
									<span class="rn">{r.name}</span>
									<span class="rv num">{r.value}{#if r.unit && r.unit.length <= 3}<small> {r.unit}</small>{/if}</span>
									<span class="rs status-{r.level}">{r.status}</span>
								</div>
							{/each}
						</div>
					</section>
				{/if}

				{#if v.activity.length}
					<section class="last">
						<h2>Recent activity</h2>
						<ul class="feed">
							{#each v.activity as a (a.key)}
								<li><CategoryIcon kind={kind(a.kind)} size={36} /><span class="ft">{a.title}</span><span class="muted sm">{a.day}</span></li>
							{/each}
						</ul>
					</section>
				{/if}
			</div>
		</div>

		<footer class="foot muted sm">Logged with Waterline · read-only</footer>
	</main>
</div>

<PublicAnalytics ga4Id={data.analytics.ga4Id} consent={data.analytics.consent} />

<style>
	.pub {
		min-height: 100dvh;
		background: var(--bg);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 20px;
		justify-content: space-between;
	}
	.brand {
		color: var(--text);
	}
	.sm {
		font-size: 13px;
	}
	.sm-btn {
		min-height: 34px;
		font-size: 13px;
	}
	.hero {
		height: 220px;
		overflow: hidden;
		border: none;
	}
	.hero img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.wrap {
		max-width: 1120px;
		margin: 0 auto;
		padding: 16px 20px 40px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	h1 {
		margin: 0;
		font-size: 30px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.intro p {
		margin: 4px 0 0;
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		margin-top: 12px;
	}
	.pill {
		font-size: 14px;
		font-weight: 600;
		padding: 4px 10px;
		border-radius: 999px;
	}
	.pill.bad {
		background: var(--bad-bg);
		color: var(--bad-text);
	}
	.pill.ok {
		background: var(--ok-bg);
		color: var(--ok-text);
	}
	.desc {
		margin-top: 14px !important;
		line-height: 1.6;
		max-width: 680px;
	}
	.cols,
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
	}
	/* Phones (P2): readings first, then chart, photos, the tank, activity. */
	@media (max-width: 1023px) {
		.col {
			display: contents;
		}
		.first {
			order: -1;
		}
		.last {
			order: 1;
		}
	}
	h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	.sh {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.chart {
		padding: 16px;
	}
	.ch {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		justify-content: space-between;
		align-items: center;
	}
	.chips {
		display: flex;
		gap: 6px;
	}
	.chip[aria-pressed='true'] {
		color: var(--on-accent);
	}
	.photos {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
	}
	.photos img {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 8px;
		display: block;
	}
	.list {
		display: flex;
		flex-direction: column;
	}
	.li {
		display: flex;
		justify-content: space-between;
		padding: 10px 14px;
	}
	.li + .li {
		border-top: 1px solid var(--border);
	}
	.strong {
		font-weight: 700;
	}
	.readings {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.rd {
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
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
		font-size: 13px;
		color: var(--text-muted);
	}
	.rv {
		font-size: 22px;
		font-weight: 600;
	}
	.rv small {
		font-size: 12px;
		color: var(--text-muted);
		font-weight: 400;
	}
	.rs {
		font-size: 12px;
		font-weight: 600;
	}
	.feed {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.feed li {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.ft {
		flex: 1;
		font-size: 15px;
		font-weight: 600;
	}
	.foot {
		text-align: center;
		padding-top: 12px;
	}
	@media (min-width: 1024px) {
		.top {
			padding: 16px 32px;
		}
		.hero {
			height: 320px;
			max-width: 1120px;
			margin: 0 auto;
			border-radius: 20px;
		}
		.wrap {
			padding: 24px 32px 48px;
		}
		h1 {
			font-size: 40px;
		}
		.cols {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 380px;
			gap: 32px;
			align-items: start;
		}
		.photos {
			grid-template-columns: repeat(4, 1fr);
		}
	}
</style>
