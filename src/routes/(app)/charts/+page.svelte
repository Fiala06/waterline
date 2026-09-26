<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import TrendChart from '$lib/components/TrendChart.svelte';
	import { CHART_RANGES } from '$lib/charts';
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
	const chosen = $derived(data.chart?.markers.find((m) => m.href === selected) ?? null);
	const hasDosing = $derived(data.chart?.markers.some((m) => m.kind === 'dosing'));
</script>

<svelte:head><title>Charts · Waterline</title></svelte:head>

<div class="page">
	<a class="back" href="/">‹ Dashboard</a>
	<div class="head">
		<h1>Charts</h1>
		{#if data.tank}<button type="button" class="tank" onclick={() => (ui.tankSwitcher = true)}>{data.tank.name} ▾</button>{/if}
	</div>

	{#if !data.tank}
		<div class="card empty"><strong>No tanks yet</strong><a href="/tanks/new">Add tank</a></div>
	{:else}
		<div class="layout">
			<nav class="plist" aria-label="Parameter">
				<div class="caps">Parameter</div>
				{#each data.list as p (p.id)}
					<a class="pitem" class:active={data.chart?.paramId === p.id} aria-current={data.chart?.paramId === p.id ? 'true' : undefined} href={q({ p: p.id })}>
						<span>{p.name}</span><span class="status-{p.level}" title={p.status}><span aria-hidden="true">{p.icon}</span><span class="sr-only">{p.status}</span></span>
					</a>
				{/each}
			</nav>

			<div class="main">
				<label class="picker">
					<span class="sr-only">Parameter</span>
					<select value={data.chart?.paramId} onchange={(e) => goto(q({ p: e.currentTarget.value }), { noScroll: true })}>
						{#each data.list as p (p.id)}<option value={p.id}>{p.name}{p.unit ? ` · ${p.unit}` : ''}</option>{/each}
					</select>
				</label>

				<div class="card chart-card">
					{#if data.chart}
						<div class="c-head">
							<div class="c-title">
								<h2>{data.chart.name}</h2>
								<span class="muted sm">{data.chart.unit}{data.chart.target ? ` · target ${data.chart.target.replace(` ${data.chart.unit}`, '')}` : ''}</span>
							</div>
							<div class="ranges" role="group" aria-label="Time range">
								{#each CHART_RANGES as r (r.key)}
									<a class="rg" class:active={data.range === r.key} aria-current={data.range === r.key ? 'true' : undefined} href={q({ r: r.key })} data-sveltekit-noscroll>{r.label}</a>
								{/each}
							</div>
						</div>

						{#if data.chart.points.length >= 2}
							<TrendChart
								full
								height={300}
								points={data.chart.points}
								band={data.chart.band}
								{markers}
								from={data.chart.from}
								to={data.chart.to}
								lastLevel={data.chart.stats?.latestLevel}
								label="{data.chart.name} over time"
								{selected}
								onselect={(m) => (selected = selected === m.href ? null : m.href)}
							>
								{#snippet popover(m)}
									{@const full = data.chart?.markers.find((x) => x.href === m.href)}
									<div class="pop-day">{full?.day} · {m.kind === 'dosing' ? 'Dosing' : 'Water change'}</div>
									<div class="pop-title">{m.label.replace(/^Water change · /, '')}</div>
									{#if full?.change}<div class="pop-change">{full.change}</div>{/if}
									<a class="pop-link" href={m.href}>View entry ›</a>
								{/snippet}
							</TrendChart>
							<div class="legend">
								{#if data.chart.target}<span><i class="lg-band"></i>Target {data.chart.target}</span>{/if}
								{#if data.chart.markers.some((m) => m.kind !== 'dosing')}<span><i class="lg-marker"></i>Water changes (tap to open)</span>{/if}
								{#if hasDosing}
									<button type="button" class="lg-toggle" aria-pressed={showDosing} onclick={() => (showDosing = !showDosing)}>
										<i class="lg-marker dosing"></i>{showDosing ? 'Hide dosing' : 'Show dosing'}
									</button>
								{/if}
							</div>
						{:else}
							<p class="muted">Charts appear after your second test.</p>
						{/if}
					{:else}
						<p class="muted">No parameters tracked for this tank.</p>
					{/if}
				</div>

				{#if data.chart?.stats}
					{@const s = data.chart.stats}
					<div class="stats">
						<div class="card stat">
								<span class="sl">Latest</span><span class="sv num">{s.latest}</span>
								<span class="sl strong status-{s.latestLevel}">{s.latestStatus}</span>
							</div>
						<div class="card stat"><span class="sl">Average</span><span class="sv num">{s.average}</span></div>
						<div class="card stat mm"><span class="sl">Min / max</span><span class="sv num">{s.min} / {s.max}</span></div>
						<div class="card stat"><span class="sl">In range</span><span class="sv num">{s.inRange}</span></div>
					</div>
				{/if}
			</div>

			{#if markers.length}
				<aside class="events">
					<h2 class="caps">Events in range</h2>
					<ul>
						{#each [...markers].reverse() as m (m.href)}
							<li>
								<button type="button" class:active={chosen?.href === m.href} onclick={() => (selected = m.href)}>
									<span>{m.label}</span><span class="muted sm">{m.day}</span>
								</button>
							</li>
						{/each}
					</ul>
				</aside>
			{/if}
		</div>
	{/if}
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
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
	}
	.plist,
	.events {
		display: none;
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.picker select {
		width: 100%;
		height: 52px;
		border-radius: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		padding: 0 16px;
		font-size: 17px;
		font-weight: 600;
	}
	.chart-card {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.c-head {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.c-title {
		display: none;
	}
	.c-title h2 {
		margin: 0;
		font-size: 20px;
	}
	.ranges {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 4px;
		padding: 4px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--border);
	}
	.rg {
		height: 36px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		color: var(--text-muted);
	}
	.rg.active {
		background: var(--border);
		color: var(--text);
		font-weight: 600;
	}
	.sm {
		font-size: 13px;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		font-size: 13px;
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
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.stat {
		border-radius: 12px;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
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
	}
	.empty {
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.caps {
		margin: 0;
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
		font-weight: 400;
	}

	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
		}
		.back,
		.tank,
		.picker {
			display: none;
		}
		.layout {
			display: grid;
			grid-template-columns: 200px minmax(0, 1fr) 280px;
			gap: 24px;
			align-items: start;
		}
		.plist {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}
		.plist .caps {
			padding: 0 12px 6px;
		}
		.pitem {
			height: 40px;
			padding: 0 12px;
			border-radius: 10px;
			display: flex;
			justify-content: space-between;
			align-items: center;
			color: var(--text-2);
			font-size: 15px;
		}
		.pitem:hover {
			background: var(--surface);
		}
		.pitem.active {
			background: var(--selected);
			color: var(--accent);
			font-weight: 600;
		}
		.chart-card {
			padding: 20px;
		}
		.c-head {
			flex-direction: row;
			justify-content: space-between;
			align-items: center;
		}
		.c-title {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}
		.ranges {
			width: 280px;
		}
		.stats {
			grid-template-columns: repeat(4, 1fr);
		}
		.stat.mm {
			display: flex;
		}
		.events {
			display: flex;
			flex-direction: column;
			gap: 8px;
		}
		.events ul {
			list-style: none;
			margin: 0;
			padding: 0;
			display: flex;
			flex-direction: column;
			gap: 6px;
		}
		.events button {
			width: 100%;
			text-align: left;
			padding: 12px;
			border-radius: 12px;
			background: var(--surface);
			border: 1px solid var(--border);
			display: flex;
			flex-direction: column;
			gap: 2px;
			font-size: 14px;
			font-weight: 600;
		}
		.events button.active {
			border-color: var(--accent);
		}
	}
</style>
