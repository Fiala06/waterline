<script lang="ts">
	// Charts (README → Screens §3): the parameter list, the chart with labelled
	// axes and a range control, and beside it the stats, what stands out, and
	// the events in range. Phones get parameter chips, a full-width range
	// control, a tooltip pinned to the latest reading and a 2×2 stats grid.
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { hscroll } from '$lib/actions';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import TrendChart from '$lib/components/TrendChart.svelte';
	import { CHART_RANGES } from '$lib/charts';

	let { data } = $props();
	let selected = $state<string | null>(null);
	// Dosing can be several times a week, so its markers are opt-in.
	let showDosing = $state(false);
	const markers = $derived((data.chart?.markers ?? []).filter((m) => showDosing || m.kind !== 'dosing'));

	const q = (patch: Record<string, string>) => {
		const u = new URLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(patch)) u.set(k, v);
		return `/charts?${u}`;
	};
	// The range form keeps the other query params (GET forms replace them all).
	const keep = (name: string) => [...page.url.searchParams].filter(([k]) => k !== name);
	const submit = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLSelectElement).form?.requestSubmit();

	const chosen = $derived(data.chart?.markers.find((m) => m.href === selected) ?? null);
	const hasDosing = $derived(data.chart?.markers.some((m) => m.kind === 'dosing'));
	// "ppm · target 5–20"; pH has no unit, so just "target 6.5–7.5"
	const subtitle = $derived(
		[data.chart?.unit, data.chart?.targetBare && `target ${data.chart.targetBare}`].filter(Boolean).join(' · ')
	);
	// phones say the latest reading here: "35 ppm · target 5–20"
	const phoneSubtitle = $derived.by(() => {
		const c = data.chart;
		if (!c?.stats) return subtitle;
		return [`${c.stats.latest}${c.unit ? ` ${c.unit}` : ''}`, c.targetBare && `target ${c.targetBare}`].filter(Boolean).join(' · ');
	});

	// the tooltip stays on the latest reading on phones
	let phone = $state(false);
	onMount(() => {
		const mq = matchMedia('(max-width: 1023px)');
		const sync = () => (phone = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});
</script>

<svelte:head><title>Charts · Waterline</title></svelte:head>

<div class="page">
	{#if !data.tank}
		<div class="none">
			<EmptyState icon="tank" title="No tanks yet" text="Add your first tank to start logging." href="/tanks/new" label="Add tank" primary />
		</div>
	{:else if !data.chart}
		<div class="none">
			<EmptyState icon="test" title="No parameters tracked for this tank." href="/tanks/{data.tank.id}/targets" label="Parameters & targets" />
		</div>
	{:else}
		{@const c = data.chart}
		<div class="layout">
			<nav class="plist hscroll" aria-label="Parameter" use:hscroll={c.paramId}>
				<span class="caps kicker hide-phone">Parameter</span>
				{#each data.list as p (p.id)}
					<a class="pitem chip" class:active={c.paramId === p.id} class:selected={c.paramId === p.id} aria-current={c.paramId === p.id ? 'true' : undefined} href={q({ p: p.id })}>
						<span class="p-name">{p.name}</span>
						{#if p.level !== 'none'}
							<span class="p-status status-{p.level}" title={p.status}><span aria-hidden="true">{p.icon}</span><span class="sr-only">{p.status}</span></span>
						{/if}
					</a>
				{/each}
			</nav>

			<div class="centre">
				<div class="c-head">
					<div class="c-title">
						<h2>{c.name}</h2>
						{#if subtitle || phoneSubtitle}
							<span class="c-sub"><span class="hide-phone">{subtitle}</span><span class="hide-desk">{phoneSubtitle}</span></span>
						{/if}
					</div>
					<form class="range-form" method="GET" action="/charts" data-sveltekit-noscroll data-sveltekit-keepfocus>
						{#each keep('r') as [k, v], i (i)}<input type="hidden" name={k} value={v} />{/each}
						<fieldset>
							<legend class="sr-only">Time range</legend>
							<div class="segmented ranges">
								{#each CHART_RANGES as r (r.key)}
									<label><input type="radio" name="r" value={r.key} checked={data.range === r.key} onchange={submit} />{r.long}</label>
								{/each}
							</div>
						</fieldset>
						<noscript><button class="btn">Apply</button></noscript>
					</form>
				</div>

				{#if c.points.length >= 2}
					<div class="chart-card">
						<div class="chart-box">
							<div class="chart-fill">
								<TrendChart
									fit
									full
									height={260}
									points={c.points}
									band={c.band}
									{markers}
									from={c.from}
									to={c.to}
									lastLevel={c.stats?.latestLevel}
									label="{c.name} over time"
									name={c.name}
									unit={c.unit}
									decimals={c.decimals}
									timeZone={data.user.timeZone}
									pinLatest={phone}
									{selected}
									onselect={(m) => (selected = selected === m.href ? null : m.href)}
								>
									{#snippet popover(m)}
										{@const full = c.markers.find((x) => x.href === m.href)}
										<div class="pop-day">{full?.day} · {m.kind === 'dosing' ? 'Dosing' : 'Water change'}</div>
										<div class="pop-title">{m.label.replace(/^Water change · /, '')}</div>
										{#if full?.change}<div class="pop-change">{full.change}</div>{/if}
										<a class="pop-link" href={m.href}>View entry ›</a>
									{/snippet}
								</TrendChart>
							</div>
						</div>
					</div>
					<div class="legend">
						{#if c.target}
							<span><i class="lg-band"></i>Target {c.target}</span>
						{/if}
						{#if c.markers.some((m) => m.kind !== 'dosing')}
							<span><i class="lg-marker"></i>Water change</span>
						{/if}
						{#if hasDosing}
							<button type="button" class="lg-toggle" aria-pressed={showDosing} onclick={() => (showDosing = !showDosing)}>
								<span aria-hidden="true">◆</span>{showDosing ? 'Hide dosing' : 'Show dosing'}
							</button>
						{/if}
					</div>
				{:else}
					<div class="chart-empty">
						{#if c.allTime >= 2}
							<EmptyState compact icon="test" title="Fewer than 2 readings in this range" text="Try a longer range." />
						{:else}
							<EmptyState compact icon="test" title="Charts appear after your second test." href="/entries/test/new?tank={data.tank.id}" label="Log water test" />
						{/if}
					</div>
				{/if}

				{#if c.insight}
					<p class="insight" class:warn={c.insight.warn}>
						<b aria-hidden="true">{c.insight.up ? '↗' : '↘'}</b><span>{c.insight.text}</span>
					</p>
				{/if}

			</div>

			<div class="side">
				{#if c.stats}
					{@const s = c.stats}
					<div class="stats">
						<div class="stat latest hide-phone">
							<span class="sl">Latest</span>
							<span class="sv num status-{s.latestLevel}">{s.latest}{c.unit ? ` ${c.unit}` : ''}</span>
							<span class="st status-{s.latestLevel}">{s.latestStatus}</span>
						</div>
						<div class="stat"><span class="sl">Average</span><span class="sv num">{s.average}</span></div>
						<div class="stat"><span class="sl">Range</span><span class="sv num">{s.range}</span></div>
						<div class="stat"><span class="sl">In target</span><span class="sv num">{s.inTarget}</span><span class="st">{s.inRangePct} in range</span></div>
						<div class="stat"><span class="sl">Change</span><span class="sv num">{s.change?.amount ?? '–'}</span>{#if s.change}<span class="st">{s.change.over}</span>{/if}</div>
					</div>
				{/if}
				{#if markers.length}
					<div class="events">
						<h2 class="kicker">Events in range · {markers.length}</h2>
						<ul>
							{#each [...markers].reverse() as m (m.href)}
								<li>
									<button type="button" class:active={chosen?.href === m.href} aria-pressed={chosen?.href === m.href} onclick={() => (selected = selected === m.href ? null : m.href)}>
										<span class="e-row"><span class="e-title">{m.label}</span><span class="e-day">{m.day}</span></span>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>

			{#if c.others.length}
				<section class="compare" aria-labelledby="compare-h">
					<h2 id="compare-h">{c.name} in your other tanks</h2>
					<div class="cmp-grid">
						{#each c.others as o (o.tankId)}
							<div class="cmp">
								<div class="cmp-head">
									<a class="cmp-tank" href="/charts?tank={o.tankId}&p={o.paramId}&r={data.range}">{o.tankName}</a>
									<span class="cmp-latest"><span class="num">{o.latest}</span> <span class="status-{o.level} cmp-st">{o.status}</span></span>
								</div>
								{#if o.points.length >= 2}
									<div class="cmp-chart">
										<TrendChart
											fit
											points={o.points}
											band={o.band}
											from={c.from}
											to={c.to}
											lastLevel={o.level}
											label="{c.name} in {o.tankName}"
											name={c.name}
											unit={c.unit}
											decimals={o.decimals}
											timeZone={data.user.timeZone}
										/>
									</div>
								{:else}
									<p class="cmp-none">Fewer than 2 readings in this range</p>
								{/if}
								{#if o.target}<p class="cmp-target">Target {o.target}</p>{/if}
							</div>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* ── Phone: chips, title, range, chart, stats, insight, legend… ───── */
	.page {
		padding: 12px 20px 24px;
	}
	.none {
		max-width: 560px;
	}
	.layout {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}
	/* the two columns dissolve so their parts can be ordered down the phone */
	.centre,
	.side {
		display: contents;
	}
	.plist {
		order: 0;
		gap: 6px;
		margin-inline: -20px;
		padding-inline: 20px;
	}
	.pitem {
		gap: 4px;
		height: 36px;
		padding: 0 12px;
		font-size: 13px;
		font-weight: 700;
	}
	.pitem .p-status {
		font-size: 12px;
	}
	.pitem.selected .p-status {
		color: var(--on-accent) !important;
	}
	.c-head {
		order: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.c-title {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		column-gap: 8px;
		min-width: 0;
	}
	.c-title h2 {
		margin: 0;
		font-size: 26px;
	}
	.c-sub {
		font-size: 14px;
		color: var(--text-muted);
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	.ranges label {
		min-height: 40px;
		font-size: 13px;
	}
	.chart-card,
	.chart-empty {
		order: 2;
	}
	.chart-box {
		position: relative;
		height: 240px;
	}
	.chart-fill {
		position: absolute;
		inset: 0;
	}
	.stats {
		order: 3;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		border-top: 2px solid var(--ink);
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		padding: 10px 12px 10px 0;
		border-bottom: 1px solid var(--divider);
	}
	.stat:nth-child(even) {
		padding: 10px 0 10px 12px;
	}
	.sl {
		font-size: 12px;
		color: var(--text-muted);
	}
	.sv {
		font-size: 18px;
		font-weight: 800;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.st {
		font-size: 12px;
		font-weight: 800;
		color: var(--text-muted);
	}
	.insight {
		order: 4;
		margin: 0;
		display: flex;
		gap: 10px;
		padding: 12px 0;
		border-bottom: 1px solid var(--divider);
		font-size: 13px;
		line-height: 1.45;
		color: var(--text-2);
	}
	.insight b {
		flex-shrink: 0;
	}
	.insight.warn b {
		color: var(--bad);
	}
	.legend {
		order: 5;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		column-gap: 20px;
		font-size: 13px;
		color: var(--text-2);
	}
	.legend > span {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 28px;
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
	.lg-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		font-size: 13px;
		font-weight: 800;
		color: var(--accent-text);
	}
	.events {
		order: 6;
		display: flex;
		flex-direction: column;
	}
	.events h2 {
		margin: 0;
		padding-bottom: 8px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
	}
	.events ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.events button {
		width: 100%;
		min-height: 44px;
		text-align: left;
		padding: 10px 8px;
		border-bottom: 1px solid var(--divider);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.events button.active {
		background: var(--surface);
	}
	.e-row {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		width: 100%;
	}
	.e-title {
		font-size: 14px;
		font-weight: 600;
	}
	.e-day {
		font-size: 12px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.compare {
		order: 7;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.compare h2 {
		margin: 8px 0 0;
		font-size: 17px;
	}
	.cmp-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 16px;
	}
	.cmp {
		border-top: 2px solid var(--ink);
		padding: 10px 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.cmp-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.cmp-tank {
		font-weight: 800;
		color: var(--text);
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		margin: -12px 0;
	}
	.cmp-latest {
		font-size: 15px;
		font-weight: 800;
		white-space: nowrap;
	}
	.cmp-st {
		font-size: 12px;
	}
	.cmp-chart {
		height: 120px;
	}
	.cmp-none,
	.cmp-target {
		margin: 0;
		font-size: 12px;
		color: var(--text-muted);
	}
	.pop-day {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.pop-title {
		font-size: 14px;
		font-weight: 800;
	}
	.pop-change {
		font-size: 12px;
		color: var(--text-2);
	}
	.pop-link {
		font-size: 12px;
		font-weight: 700;
		display: inline-block;
		padding-top: 4px;
	}

	/* ── Desktop: parameters | chart | stats and events ───────────────── */
	@media (min-width: 1024px) {
		.page {
			padding: 0 32px;
		}
		.none {
			padding: 28px 0;
		}
		.layout {
			display: grid;
			grid-template-columns: 168px minmax(0, 1fr) 260px;
			grid-template-rows: auto 1fr;
			grid-template-areas:
				'plist centre side'
				'plist compare side';
			gap: 0;
			min-height: calc(100dvh - 240px);
		}
		.centre,
		.side {
			display: flex;
			flex-direction: column;
			min-width: 0;
		}
		.centre {
			grid-area: centre;
			gap: 14px;
			padding: 24px 24px 20px;
		}
		.compare {
			grid-area: compare;
			padding: 0 24px 32px;
		}
		.side {
			grid-area: side;
			gap: 20px;
			padding: 24px 0 32px 24px;
			border-left: 2px solid var(--divider);
		}
		.plist {
			grid-area: plist;
			display: flex;
			flex-direction: column;
			gap: 0;
			margin: 0;
			padding: 24px 16px 32px 0;
			overflow: visible;
			border-right: 2px solid var(--divider);
			-webkit-mask-image: none;
			mask-image: none;
		}
		.plist .caps {
			padding: 0 8px 8px;
		}
		.pitem,
		.pitem.selected {
			height: 40px;
			padding: 0 8px;
			border: none;
			justify-content: space-between;
			background: transparent;
			color: var(--text);
			font-size: 14px;
			font-weight: 400;
		}
		.pitem::after {
			content: none;
		}
		.pitem:hover {
			background: var(--surface);
		}
		.pitem.selected {
			background: var(--surface);
			font-weight: 800;
		}
		.pitem .p-status,
		.pitem.selected .p-status {
			font-size: 12px;
			font-weight: 800;
		}
		.pitem.selected .p-status.status-bad {
			color: var(--bad) !important;
		}
		.pitem.selected .p-status.status-warn {
			color: var(--warn) !important;
		}
		.pitem.selected .p-status.status-ok {
			color: var(--ok) !important;
		}
		.c-head {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
			gap: 12px 16px;
		}
		.c-title {
			column-gap: 10px;
		}
		.c-title h2 {
			font-size: 32px;
		}
		.c-sub {
			font-size: 15px;
			white-space: nowrap;
		}
		.range-form {
			flex-shrink: 0;
		}
		.ranges label {
			min-height: 36px;
			padding: 0 14px;
			font-size: 14px;
			white-space: nowrap;
		}
		/* the chart under a 2px ink rule, as tall as the window allows */
		.chart-card {
			border-top: 2px solid var(--ink);
			padding-top: 12px;
		}
		.chart-box {
			height: clamp(340px, calc(100dvh - 400px), 560px);
		}
		.insight {
			border-top: 1px solid var(--divider);
			font-size: 14px;
		}
		.stats {
			order: 0;
		}
		.stat.latest {
			grid-column: 1 / -1;
			padding-right: 0;
		}
		.sv {
			font-size: 20px;
			white-space: normal;
		}
		.events {
			order: 0;
		}
		.compare h2 {
			font-size: 20px;
		}
		.cmp-grid {
			grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
			gap: 24px;
		}
		.cmp-chart {
			height: 96px;
		}
	}
	/* Narrow desktop (main < 1000px): stats and events move under the chart, side by side */
	@media (min-width: 1024px) and (max-width: 1199px) {
		.layout {
			grid-template-columns: 150px minmax(0, 1fr);
			grid-template-rows: auto auto 1fr;
			grid-template-areas:
				'plist centre'
				'plist side'
				'plist compare';
		}
		.plist {
			padding-right: 12px;
		}
		.side {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			align-content: start;
			gap: 20px 24px;
			padding: 20px 0 32px 24px;
			border-left: none;
			border-top: 2px solid var(--divider);
		}
		.chart-box {
			height: clamp(300px, calc(100dvh - 520px), 440px);
		}
		.compare {
			padding-top: 8px;
		}
	}
</style>
