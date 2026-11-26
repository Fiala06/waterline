<script lang="ts" module>
	export interface LanePoint {
		t: number;
		v: number;
		level: 'ok' | 'warn' | 'bad' | 'none';
		label: string;
	}
	export interface Lane {
		id: string;
		name: string;
		unit: string;
		decimals: number;
		target: string;
		band: { min: number | null; max: number | null };
		points: LanePoint[];
		/** a probe's readings, a thin line under the tests */
		sensor: { t: number; v: number }[];
		latest: string | null;
		level: 'ok' | 'warn' | 'bad' | 'none';
		status: string;
	}
	export interface LaneMarkers {
		waterChanges: { t: number; short: string; label: string }[];
		doses: { t: number; label: string }[];
		changes: { n: number; t: number; day: string; text: string; loss: boolean }[];
	}
</script>

<script lang="ts">
	// The public page's "Readings & events" (#public overhaul): every tested parameter in
	// its own lane on one shared time axis, then rows for water changes, dosing and
	// numbered changes to the tank, with a dashed line through every lane at each water
	// change. Built for someone diagnosing a problem: "ammonia jumped the day the light
	// and the wood changed" should be visible without reading the log. Sized to its box;
	// each mark is focusable and names itself, and the chosen one's details show under it.
	// Lanes that stayed in range all period fold to one line each, with a small trend: a tap
	// opens the full chart, and "Show all as charts" opens them all (the full ones stay full).
	import { onMount } from 'svelte';
	import { chartDomain } from '$lib/charts';
	import Sparkline from './Sparkline.svelte';
	import { formatNumber } from '$lib/units';
	import { timeScale, valueScale } from './trend-chart';

	let {
		lanes,
		markers,
		axis
	}: {
		lanes: Lane[];
		markers: LaneMarkers;
		axis: { from: number; to: number; now: number; ticks: { t: number; label: string }[] };
	} = $props();

	// the plot's width; the server renders at a typical desktop width until the page measures it
	let width = $state(860);
	const H = 64;
	const PAD = 8;
	// room on the right for each lane's scale
	const PADR = 34;
	const round = (n: number) => Math.round(n * 10) / 10;
	const xAt = $derived(timeScale(axis.from, axis.to, PAD, PADR, width));
	const x = (t: number) => round(xAt(t));
	const dom = (l: Lane) => chartDomain([...l.points.map((p) => p.v), ...l.sensor.map((s) => s.v)], l.band);
	// 6px clear of the lane's top and bottom
	const yOf = (l: Lane, v: number) => round(valueScale(dom(l), 6, H - 12)(v));
	const bandRect = (l: Lane) => {
		if (l.band.min == null && l.band.max == null) return null;
		const d = dom(l);
		const top = yOf(l, Math.min(l.band.max ?? d.hi, d.hi));
		const bottom = yOf(l, Math.max(l.band.min ?? d.lo, d.lo));
		return { y: top, h: Math.max(2, bottom - top) };
	};
	const scaleLabel = (l: Lane, v: number) => formatNumber(v, l.decimals);

	// the mark a visitor pointed at, tapped or tabbed to: its words show under the chart
	let chosen = $state<string | null>(null);
	const show = (label: string) => () => (chosen = label);
	// one tab stop per lane, the latest mark (#267); the arrow keys, Home and End move along it
	function rove(e: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
		const marks = [...(e.currentTarget as SVGElement).querySelectorAll<SVGElement>('[data-mark]')];
		const i = marks.indexOf(document.activeElement as SVGElement);
		if (i < 0) return;
		e.preventDefault();
		const j = e.key === 'Home' ? 0 : e.key === 'End' ? marks.length - 1 : Math.max(0, Math.min(marks.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
		marks[i].setAttribute('tabindex', '-1');
		marks[j].setAttribute('tabindex', '0');
		marks[j].focus();
	}
	const wc = $derived(markers.waterChanges.map((m) => ({ ...m, x: x(m.t) })));
	// the cleanest way to keep two water changes on one day readable: one label for both
	const wcLabels = $derived.by(() => {
		const out: { x: number; text: string }[] = [];
		for (const m of wc) {
			const last = out.at(-1);
			if (last && m.x - last.x < 34) last.text = last.text.replace(/( ×\d+)?$/, (s) => ` ×${s ? Number(s.slice(2)) + 1 : 2}`);
			else out.push({ x: m.x, text: m.short });
		}
		return out;
	});
	// numbered marks too close to sit side by side take turns on two rows
	const chg = $derived.by(() => {
		let last = -Infinity;
		let row = 0;
		return markers.changes.map((c) => {
			const cx = x(c.t);
			row = cx - last < 20 ? 1 - row : 0;
			last = cx;
			return { ...c, cx, cy: row ? 30 : 11 };
		});
	});
	// a lane needs its full chart when its latest reading or any in the period is near or out of range
	const needsLook = (l: Lane) => l.level === 'bad' || l.level === 'warn' || l.points.some((p) => p.level === 'bad' || p.level === 'warn');
	const full = $derived(lanes.filter(needsLook));
	const calm = $derived(lanes.filter((l) => !needsLook(l)));
	let allOpen = $state(false);
	let mounted = $state(false);
	onMount(() => (mounted = true));
	const hasEvents = $derived(markers.waterChanges.length + markers.doses.length + markers.changes.length > 0);
</script>

{#snippet lane(l: Lane, label: boolean)}
		{@const band = bandRect(l)}
		{@const d = dom(l)}
		<div class="lane" class:nolab={!label}>
			{#if label}<div class="lab">
				<span class="ln">{l.name}</span>
				<span class="lt">{l.target ? `target ${l.target}` : 'no target'}</span>
				{#if l.latest}<span class="lv status-{l.level}">{l.latest} <span class="ls">{l.status}</span></span>{/if}
			</div>{:else}<div class="lab"></div>{/if}
			<div class="plot">
				<svg width="100%" height={H} viewBox="0 0 {width} {H}" role="toolbar" tabindex="-1" aria-label="{l.name}: {l.points.length} readings{l.target ? `, target ${l.target}` : ''}" onkeydown={rove}>
					{#if band}<rect class="band" x={PAD} y={band.y} width={width - PAD - PADR} height={band.h} />{/if}
					{#each wc as m, i (i)}<line class="guide" x1={m.x} x2={m.x} y1="0" y2={H} />{/each}
					<line class="now" x1={x(axis.now)} x2={x(axis.now)} y1="0" y2={H} />
					<text class="scale" x={width - PADR + 6} y="10">{scaleLabel(l, d.hi)}</text>
					<text class="scale" x={width - PADR + 6} y={H - 2}>{scaleLabel(l, d.lo)}</text>
					{#if l.sensor.length > 1}<polyline class="sensor" points={l.sensor.map((p) => `${x(p.t)},${yOf(l, p.v)}`).join(' ')} />{/if}
					{#if l.points.length > 1}<polyline class="line" points={l.points.map((p) => `${x(p.t)},${yOf(l, p.v)}`).join(' ')} />{/if}
					{#each l.points as p, i (i)}
						<circle class="pt {p.level}" cx={x(p.t)} cy={yOf(l, p.v)} r={p.level === 'bad' ? 4.5 : 3.5} data-mark tabindex={i === l.points.length - 1 ? 0 : -1} role="button" aria-label="{l.name} {p.label}" onpointerenter={show(`${l.name} · ${p.label}`)} onfocus={show(`${l.name} · ${p.label}`)}>
							<title>{l.name} · {p.label}</title>
						</circle>
					{/each}
				</svg>
			</div>
		</div>
{/snippet}

<div class="lanes">
	{#each full as l (l.id)}{@render lane(l, true)}{/each}
	{#if calm.length}
		<div class="calm-h">
			<span>In range all period · {calm.length}</span>
			{#if mounted && calm.length > 1}<button type="button" class="all" onclick={() => (allOpen = !allOpen)}>{allOpen ? 'Show fewer charts' : 'Show all as charts'}</button>{/if}
		</div>
		{#each calm as l (l.id)}
			<details class="calm" open={allOpen}>
				<summary>
					<span class="cn">{l.name}</span>
					<span class="cv">{#if l.latest}{l.latest} <span class="ls">{l.status}</span>{:else}<span class="ls">{l.status}</span>{/if}</span>
					<span class="cs"><Sparkline values={l.points.map((p) => p.v)} level={l.level === 'none' ? 'ok' : l.level} lo={l.band.min} hi={l.band.max} /></span>
					<span class="ct">{l.target ? `target ${l.target}` : 'no target'}</span>
					<span class="chev" aria-hidden="true">›</span>
				</summary>
				{@render lane(l, false)}
			</details>
		{/each}
	{/if}

	{#if hasEvents}
		<div class="lane ev first">
			<div class="lab"><span class="ln">Water changes</span><span class="lt">{markers.waterChanges.length} in this period</span></div>
			<div class="plot">
				<svg width="100%" height="40" viewBox="0 0 {width} 40" role="toolbar" tabindex="-1" aria-label="{markers.waterChanges.length} water changes" onkeydown={rove}>
					{#each wcLabels as w (w.x)}<text class="wl" x={w.x} y="12" text-anchor="middle">{w.text}</text>{/each}
					{#each wc as m, i (i)}
						<rect class="wc" x={m.x - 4} y="20" width="8" height="8" data-mark tabindex={i === wc.length - 1 ? 0 : -1} role="button" aria-label={m.label} onpointerenter={show(m.label)} onfocus={show(m.label)}><title>{m.label}</title></rect>
					{/each}
				</svg>
			</div>
		</div>
		<div class="lane ev">
			<div class="lab"><span class="ln">Dosing</span><span class="lt">{markers.doses.length} doses</span></div>
			<div class="plot">
				<svg width="100%" height="28" viewBox="0 0 {width} 28" role="toolbar" tabindex="-1" aria-label="{markers.doses.length} doses" onkeydown={rove}>
					{#each markers.doses as m, i (i)}
						<path class="dose" d="M{x(m.t)} 8l6 6-6 6-6-6z" data-mark tabindex={i === markers.doses.length - 1 ? 0 : -1} role="button" aria-label={m.label} onpointerenter={show(m.label)} onfocus={show(m.label)}><title>{m.label}</title></path>
					{/each}
				</svg>
			</div>
		</div>
		<div class="lane ev">
			<div class="lab"><span class="ln">Tank changes</span><span class="lt">numbered below</span></div>
			<div class="plot">
				<svg width="100%" height="42" viewBox="0 0 {width} 42" role="toolbar" tabindex="-1" aria-label="{markers.changes.length} days with changes to the tank" onkeydown={rove}>
					{#each chg as c, i (c.n)}
						<g class="chg" class:loss={c.loss} data-mark tabindex={i === chg.length - 1 ? 0 : -1} role="button" aria-label="{c.n}: {c.day} · {c.text}" onpointerenter={show(`${c.n} · ${c.day} · ${c.text}`)} onfocus={show(`${c.n} · ${c.day} · ${c.text}`)}>
							<!-- no <title>: its text would count as the mark's visible text beside the number; the readout shows it on hover and focus -->
							<circle cx={c.cx} cy={c.cy} r="10" />
							<text x={c.cx} y={c.cy + 4} text-anchor="middle">{c.n}</text>
						</g>
					{/each}
				</svg>
			</div>
		</div>
	{/if}

	<div class="lane axis">
		<div class="lab"></div>
		<!-- every lane's plot is this wide: measured once, here -->
		<div class="plot" bind:clientWidth={width}>
			<svg width="100%" height="22" viewBox="0 0 {width} 22" aria-hidden="true">
				<line class="axisline" x1={PAD} x2={width - PADR} y1="1" y2="1" />
				{#each axis.ticks as tk (tk.t)}<text class="tick" x={x(tk.t)} y="16" text-anchor="middle">{tk.label}</text>{/each}
			</svg>
		</div>
	</div>
	<p class="readout" aria-live="polite">{chosen ?? 'Point at or tab to any mark for its exact value and time.'}</p>
</div>

<style>
	.lanes {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.lane {
		display: grid;
		grid-template-columns: 170px minmax(0, 1fr);
		align-items: center;
		gap: 12px;
		border-bottom: 1px solid var(--divider-soft);
		padding: 4px 0;
	}
	.lane.nolab {
		border-bottom: none;
	}
	/* the lanes that stayed in range: one line each, a tap opens the chart */
	.calm-h {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 4px 12px;
		margin-top: 18px;
		padding-bottom: 4px;
		border-bottom: 1px solid var(--divider);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.all {
		min-height: 44px;
		padding: 0;
		background: none;
		border: none;
		font: inherit;
		font-size: 14px;
		letter-spacing: 0;
		text-transform: none;
		color: var(--accent-text);
		cursor: pointer;
	}
	.calm {
		border-bottom: 1px solid var(--divider-soft);
	}
	.calm > summary {
		display: grid;
		grid-template-columns: 170px 150px minmax(0, 1fr) 150px 20px;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		cursor: pointer;
		list-style: none;
	}
	.calm > summary::-webkit-details-marker {
		display: none;
	}
	.calm > summary:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.cn {
		font-size: 14px;
		font-weight: 700;
	}
	.cv {
		font-size: 13px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.cs {
		height: 22px;
		min-width: 0;
	}
	.calm[open] .cs {
		visibility: hidden;
	}
	.ct {
		font-size: 12px;
		color: var(--text-muted);
		text-align: right;
	}
	.chev {
		font-weight: 700;
		color: var(--text-muted);
		text-align: center;
		transition: transform 0.15s;
	}
	.calm[open] .chev {
		transform: rotate(90deg);
	}
	@media (prefers-reduced-motion: reduce) {
		.chev {
			transition: none;
		}
	}
	.lane.ev.first {
		border-top: 2px solid var(--ink);
		margin-top: 6px;
	}
	.lane.axis {
		border-bottom: none;
	}
	.lab {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.ln {
		font-size: 14px;
		font-weight: 700;
	}
	.lt {
		font-size: 11px;
		color: var(--text-muted);
	}
	.lv {
		font-size: 13px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.ls {
		font-size: 11px;
	}
	.plot {
		min-width: 0;
	}
	svg {
		display: block;
		overflow: visible;
	}
	.band {
		fill: var(--band);
	}
	.guide {
		stroke: var(--neutral-500);
		stroke-width: 1;
		stroke-dasharray: 3 4;
	}
	.now {
		stroke: var(--ink);
		stroke-width: 1;
	}
	.line {
		fill: none;
		stroke: var(--ink);
		stroke-width: 2;
	}
	.sensor {
		fill: none;
		stroke: var(--neutral-500);
		stroke-width: 1.25;
	}
	.pt {
		fill: var(--ink);
		cursor: default;
	}
	.pt.bad {
		fill: var(--bad);
	}
	.pt.warn {
		fill: var(--bg);
		stroke: var(--ink);
		stroke-width: 2;
	}
	.pt:focus-visible,
	.wc:focus-visible,
	.dose:focus-visible,
	.chg:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.scale {
		font-size: 10px;
		fill: var(--text-muted);
	}
	.wl {
		font-size: 10px;
		fill: var(--text-2);
	}
	.wc {
		fill: var(--ink);
	}
	.dose {
		fill: var(--bg);
		stroke: var(--ink);
		stroke-width: 1.5;
	}
	.chg circle {
		fill: var(--ink);
	}
	.chg text {
		font-size: 10px;
		font-weight: 700;
		fill: var(--bg);
	}
	.chg.loss circle {
		fill: var(--accent);
	}
	.chg.loss text {
		fill: var(--on-accent);
	}
	.axisline {
		stroke: var(--ink);
	}
	.tick {
		font-size: 11px;
		fill: var(--text-2);
	}
	.readout {
		margin: 8px 0 0;
		min-height: 20px;
		font-size: 13px;
		color: var(--text-2);
		font-variant-numeric: tabular-nums;
	}
	/* Phones: each lane's name over its plot, the full width */
	@media (max-width: 719px) {
		.lane {
			grid-template-columns: minmax(0, 1fr);
			gap: 2px;
		}
		.lab {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: baseline;
			gap: 0 8px;
		}
		.lane.axis .lab,
		.lane.nolab .lab {
			display: none;
		}
		.calm > summary {
			grid-template-columns: minmax(0, 1fr) auto 64px 16px;
			gap: 10px;
		}
		.ct {
			display: none;
		}
	}
</style>
