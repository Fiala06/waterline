<script lang="ts">
	import { page } from '$app/state';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import TrendChart from '$lib/components/TrendChart.svelte';
	import { CHART_RANGES } from '$lib/charts';
	import { fmtDisplayValue } from '$lib/params';
	import { fmtWhen } from '$lib/time';
	import { ui } from '$lib/ui.svelte';

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
	// The picker and range forms keep the other query params (GET forms replace them all).
	const keep = (name: string) => [...page.url.searchParams].filter(([k]) => k !== name);
	const submit = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLSelectElement).form?.requestSubmit();

	const chosen = $derived(data.chart?.markers.find((m) => m.href === selected) ?? null);
	const hasDosing = $derived(data.chart?.markers.some((m) => m.kind === 'dosing'));
	// "ppm · target 5–20"; pH has no unit, so just "target 6.5–7.5"
	const subtitle = $derived(
		[data.chart?.unit, data.chart?.targetBare && `target ${data.chart.targetBare}`].filter(Boolean).join(' · ')
	);
</script>

<svelte:head><title>Charts · Waterline</title></svelte:head>

<div class="page">
	<a class="back hide-desk" href="/">‹ Dashboard</a>
	<div class="head hide-desk">
		<h1>Charts</h1>
		{#if data.tank}<button type="button" class="tank" onclick={() => (ui.tankSwitcher = true)}>{data.tank.name} ▾</button>{/if}
	</div>

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
			<nav class="plist" aria-label="Parameter">
				<div class="caps">Parameter</div>
				{#each data.list as p (p.id)}
					<a class="pitem" class:active={c.paramId === p.id} aria-current={c.paramId === p.id ? 'true' : undefined} href={q({ p: p.id })}>
						<span>{p.name}</span><span class="status-{p.level} p-status" title={p.status}><span aria-hidden="true">{p.icon}</span><span class="sr-only">{p.status}</span></span>
					</a>
				{/each}
			</nav>

			<!-- 12: "Nitrate … ppm ▾" over a native select -->
			<form class="picker" method="GET" action="/charts" data-sveltekit-noscroll data-sveltekit-keepfocus>
				{#each keep('p') as [k, v], i (i)}<input type="hidden" name={k} value={v} />{/each}
				<label class="p-box">
					<span class="sr-only">Parameter</span>
					<select name="p" value={c.paramId} onchange={submit}>
						{#each data.list as p (p.id)}<option value={p.id} selected={p.id === c.paramId}>{p.name}</option>{/each}
					</select>
					<span class="p-name" aria-hidden="true">{c.name}</span>
					<span class="p-unit" aria-hidden="true">{c.unit}<span class="p-caret"></span></span>
				</label>
				<noscript><button class="btn">Apply</button></noscript>
			</form>

			<div class="c-head">
				<div class="c-title">
					<h2>{c.name}</h2>
					{#if subtitle}<span class="c-sub">{subtitle}</span>{/if}
				</div>
				<form method="GET" action="/charts" data-sveltekit-noscroll data-sveltekit-keepfocus>
					{#each keep('r') as [k, v], i (i)}<input type="hidden" name={k} value={v} />{/each}
					<fieldset>
						<legend class="sr-only">Time range</legend>
						<div class="segmented ranges">
							{#each CHART_RANGES as r (r.key)}
								<label><input type="radio" name="r" value={r.key} checked={data.range === r.key} onchange={submit} />{r.label}</label>
							{/each}
						</div>
					</fieldset>
					<noscript><button class="btn">Apply</button></noscript>
				</form>
			</div>

			{#if c.points.length >= 2}
				<div class="card chart-card">
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
								format={(v) => fmtDisplayValue(c.param, v, data.user)}
								when={(t) => fmtWhen(new Date(t).toISOString(), data.user.timeZone)}
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
						<span><i class="lg-band"></i><span class="hide-desk">Target {c.target}</span><span class="hide-phone">Target band</span></span>
					{/if}
					{#if c.markers.some((m) => m.kind !== 'dosing')}
						<span><i class="lg-marker"></i><span class="hide-desk">Water changes (tap to open)</span><span class="hide-phone">Water change</span></span>
					{/if}
					{#if hasDosing}
						<button type="button" class="lg-toggle" aria-pressed={showDosing} onclick={() => (showDosing = !showDosing)}>
							<i class="lg-marker dosing"></i>{showDosing ? 'Hide dosing' : 'Show dosing'}
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

			<div class="side">
				{#if c.stats}
					{@const s = c.stats}
					<div class="stats">
						<div class="card stat">
							<span class="sl">Latest</span>
							<span class="sv num" class:status-bad={s.latestLevel === 'bad'} class:status-warn={s.latestLevel === 'warn'}>{s.latest}</span>
							<span class="st status-{s.latestLevel}">{s.latestStatus}</span>
						</div>
						<div class="card stat"><span class="sl">Average</span><span class="sv num">{s.average}</span></div>
						<div class="card stat mm"><span class="sl">Min / max</span><span class="sv num">{s.min} / {s.max}</span></div>
						<div class="card stat"><span class="sl">In range</span><span class="sv num">{s.inRange}</span></div>
					</div>
				{/if}
				{#if markers.length}
					<div class="events">
						<h2>Events in range</h2>
						<ul>
							{#each [...markers].reverse() as m (m.href)}
								<li>
									<button type="button" class:active={chosen?.href === m.href} aria-pressed={chosen?.href === m.href} onclick={() => (selected = m.href)}>
										<span class="e-title">{m.label}</span><span class="e-day">{m.day}</span>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
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
	/* 12: the links keep 44px tap areas; the text sits where the design puts it */
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
		gap: 14px;
		min-width: 0;
	}
	.plist,
	.c-title,
	.events {
		display: none;
	}
	/* 12: stats, then the legend */
	.legend {
		order: 1;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	.picker {
		display: flex;
		gap: 8px;
	}
	.p-box {
		position: relative;
		flex: 1;
		min-width: 0;
		height: 52px;
		border-radius: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		padding: 0 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		cursor: pointer;
	}
	.p-box:has(select:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	/* the native select takes the taps; the box shows the design */
	.p-box select {
		position: absolute;
		inset: 0;
		width: 100%;
		max-width: none;
		opacity: 0;
		cursor: pointer;
		font-size: 16px;
	}
	.p-name {
		font-size: 17px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.p-unit {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.p-caret {
		width: 0;
		height: 0;
		border-left: 4px solid transparent;
		border-right: 4px solid transparent;
		border-top: 5px solid var(--text-muted);
	}
	.chart-card {
		padding: 14px 12px 8px 6px;
	}
	.chart-box {
		position: relative;
		height: 260px;
	}
	.chart-fill {
		position: absolute;
		inset: 0;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		column-gap: 16px;
		font-size: 13px;
		color: var(--text-muted);
	}
	.legend > span {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 24px;
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
	.lg-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--accent);
		font-weight: 600;
		min-height: 44px;
	}
	.lg-marker.dosing {
		border-radius: 2px;
		transform: rotate(45deg) scale(0.85);
	}
	.pop-day {
		font-size: 12px;
		color: var(--text-muted);
	}
	.pop-title {
		font-size: 14px;
		font-weight: 600;
	}
	.pop-change {
		font-size: 12px;
		color: var(--text-2);
	}
	.pop-link {
		font-size: 12px;
		font-weight: 600;
		display: inline-block;
		padding-top: 2px;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	.stat {
		border-radius: 12px;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.stat.mm {
		display: none;
	}
	.sl {
		font-size: 12px;
		color: var(--text-muted);
	}
	.sv {
		font-size: 20px;
		font-weight: 600;
		white-space: nowrap;
	}
	.st {
		font-size: 12px;
		font-weight: 600;
	}
	.caps {
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	/* ── 19: parameters | chart | stats and events ───────────────── */
	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
		}
		.none {
			max-width: 560px;
		}
		.picker {
			display: none;
		}
		.layout {
			display: grid;
			grid-template-columns: clamp(168px, 13.9vw, 200px) minmax(0, 1fr) clamp(260px, 20.8vw, 300px);
			grid-template-rows: auto auto auto 1fr;
			grid-template-areas:
				'plist head side'
				'plist chart side'
				'plist legend side'
				'plist . side';
			column-gap: 24px;
			row-gap: 16px;
		}
		.plist {
			grid-area: plist;
			display: flex;
			flex-direction: column;
			gap: 4px;
			min-width: 0;
		}
		.plist .caps {
			padding: 0 12px 6px;
		}
		.pitem {
			min-height: 44px;
			padding: 0 12px;
			border-radius: 10px;
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 8px;
			color: var(--text);
			font-size: 15px;
		}
		.pitem:hover {
			background: var(--surface);
			color: var(--text);
		}
		.pitem.active {
			background: var(--selected);
			font-weight: 600;
		}
		.p-status {
			font-size: 13px;
		}
		.c-head {
			grid-area: head;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 16px;
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
			font-size: 28px;
			font-weight: 600;
			line-height: 1.2;
		}
		.c-sub {
			font-size: 15px;
			color: var(--text-muted);
		}
		/* 19: the compact segmented control */
		.ranges {
			border-radius: 12px;
		}
		.ranges label {
			min-height: 36px;
			padding: 0 14px;
			border-radius: 8px;
			font-size: 14px;
		}
		.chart-card,
		.chart-empty {
			grid-area: chart;
		}
		.chart-card {
			padding: 18px 20px 12px 10px;
		}
		/* the page's centerpiece: as tall as the window allows (header, title row,
		   legend and page padding are ~290px) */
		.chart-box {
			height: max(360px, calc(100dvh - 290px));
		}
		.legend {
			grid-area: legend;
			margin-top: -4px;
			column-gap: 20px;
		}
		.lg-toggle {
			min-height: 28px;
		}
		.side {
			grid-area: side;
			display: flex;
			flex-direction: column;
			gap: 16px;
			min-width: 0;
		}
		.stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
		}
		.stat {
			padding: 12px;
		}
		.stat.mm {
			display: flex;
		}
		.sv {
			font-size: 22px;
		}
		.events {
			display: flex;
			flex-direction: column;
			gap: 4px;
		}
		.events h2 {
			margin: 0;
			padding-bottom: 4px;
			font-size: 15px;
			font-weight: 600;
		}
		.events ul {
			list-style: none;
			margin: 0;
			padding: 0;
			display: flex;
			flex-direction: column;
			gap: 4px;
		}
		.events button {
			width: 100%;
			text-align: left;
			padding: 10px 12px;
			border-radius: 10px;
			display: flex;
			flex-direction: column;
			gap: 2px;
		}
		.events button:hover {
			background: var(--surface);
		}
		.events button.active {
			background: var(--selected);
		}
		.e-title {
			font-size: 14px;
			font-weight: 600;
		}
		.e-day {
			font-size: 12px;
			color: var(--text-muted);
		}
	}
	/* Narrow desktop: stats and events move under the chart */
	@media (min-width: 1024px) and (max-width: 1279px) {
		.layout {
			grid-template-columns: 168px minmax(0, 1fr);
			grid-template-rows: auto auto auto auto 1fr;
			grid-template-areas:
				'plist head'
				'plist chart'
				'plist legend'
				'plist side'
				'plist .';
		}
		.c-head {
			flex-wrap: wrap;
		}
		.chart-box {
			height: clamp(300px, calc(100dvh - 72px - 420px), 480px);
		}
		.stats {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
</style>
