<script lang="ts" module>
	export interface Line {
		id: string;
		name: string;
		unit: string;
		decimals: number;
		band: { min: number | null; max: number | null };
		points: { t: number; v: number; href?: string }[];
	}

	/** A parameter's colour and dash: seven hues in a fixed order, then the same seven dashed. */
	export function seriesStyle(index: number) {
		return { color: `var(--series-${(index % 7) + 1})`, dash: index >= 7 };
	}
</script>

<script lang="ts">
	// Every parameter on one chart: pH, nitrate and temperature share no scale,
	// so each is drawn against its own target (targetPosition), and the target
	// is one band across them all, High above it and Low below, as on a single
	// parameter's chart. No numbers up the side; hover, tap or drag (or the arrow
	// keys) for a crosshair and a readout of every reading in that test, each
	// with its value and status. A click (or Enter) opens the test.
	import type { Snippet } from 'svelte';
	import { paramStatus, statusShort } from '$lib/status';
	import { formatNumber } from '$lib/units';
	import { TARGET_BAND, targetPosition } from '$lib/charts';
	import type { Marker } from './TrendChart.svelte';
	import { readoutWhen, timeScale, tipLeft, valueScale } from './trend-chart';
	import { ChartPointer } from './chart-pointer.svelte';
	import ChartDateAxis from './ChartDateAxis.svelte';
	import ChartMarkerLines from './ChartMarkerLines.svelte';
	import ChartMarkers from './ChartMarkers.svelte';
	import ChartReadout from './ChartReadout.svelte';

	let {
		lines,
		order,
		hidden = [],
		focus = null,
		markers = [],
		from,
		to,
		timeZone,
		selected = null,
		onselect,
		popover
	}: {
		lines: Line[];
		/** each parameter's place in the full list, so its colour never changes when others are hidden */
		order: string[];
		hidden?: string[];
		/** the parameter the legend points at: the others fade */
		focus?: string | null;
		markers?: Marker[];
		from: number;
		to: number;
		timeZone?: string;
		selected?: string | null;
		onselect?: (m: Marker) => void;
		popover?: Snippet<[Marker]>;
	} = $props();

	let el = $state<HTMLDivElement>();
	let width = $state(320);
	let h = $state(240); // the phone's chart box, until it is measured
	const TOP = 22;
	const BOTTOM = 40;
	const LEFT = 8;
	const RIGHT = $derived(width < 480 ? 74 : 92);
	const plotH = $derived(Math.max(1, h - TOP - BOTTOM));
	const baseline = $derived(h - BOTTOM);

	const x = $derived(timeScale(from, to, LEFT, RIGHT, width));
	// a reading's place against its own target, 0 (bottom) to 1 (top)
	const y = $derived(valueScale({ lo: 0, hi: 1 }, TOP, plotH));
	const bandTop = $derived(y(TARGET_BAND.hi));
	const bandBottom = $derived(y(TARGET_BAND.lo));

	const shown = $derived(
		lines
			.filter((l) => !hidden.includes(l.id))
			.map((l) => ({
				...l,
				style: seriesStyle(Math.max(0, order.indexOf(l.id))),
				drawn: l.points.map((p) => ({ ...p, pos: targetPosition(p.v, l.band) ?? TARGET_BAND.lo }))
			}))
	);

	// the tests across every parameter shown, left to right: the readout steps through these
	const times = $derived([...new Set(shown.flatMap((l) => l.points.map((p) => p.t)))].sort((a, b) => a - b));

	const zones = $derived(
		[
			{ y: (TOP + bandTop) / 2, title: '✕ High', bad: true, room: bandTop - TOP },
			{ y: (bandTop + bandBottom) / 2, title: '✓ Target', bad: false, room: bandBottom - bandTop },
			{ y: (bandBottom + baseline) / 2, title: '✕ Low', bad: true, room: baseline - bandBottom }
		].filter((z) => z.room >= 14)
	);

	const when = (t: number) => readoutWhen(t, timeZone, true);

	// The readout: every reading taken in the test nearest the pointer
	const pointer = new ChartPointer({
		el: () => el,
		xs: () => times.map(x),
		href: (): string | undefined => hotHref,
		// another range, or a parameter shown or hidden: start over
		series: () => times
	});
	const active = $derived(pointer.active);
	const hotT = $derived(active != null ? (times[active] ?? null) : null);
	const hot = $derived.by(() => {
		if (hotT == null) return [];
		return shown.flatMap((l) => {
			const p = l.drawn.find((d) => d.t === hotT);
			if (!p) return [];
			const st = paramStatus(p.v, l.band);
			return [{ id: l.id, name: l.name, color: l.style.color, dash: l.style.dash, pos: p.pos, href: p.href, value: `${formatNumber(p.v, l.decimals)}${l.unit ? ` ${l.unit}` : ''}`, level: st.level, status: statusShort(st) }];
		});
	});
	const hotHref = $derived(hot.find((r) => r.href)?.href);
	const spoken = $derived.by(() => {
		const t = times[active ?? times.length - 1];
		if (t == null) return 'No readings';
		const rows = shown.flatMap((l) => {
			const p = l.points.find((d) => d.t === t);
			return p ? [`${l.name} ${formatNumber(p.v, l.decimals)}${l.unit ? ` ${l.unit}` : ''}, ${statusShort(paramStatus(p.v, l.band)).replace(/^\S+ /, '')}`] : [];
		});
		return `${when(t)}: ${rows.join('; ')}`;
	});

	/** The readout beside the crosshair, on whichever side has room, and never past the chart's edges. */
	let tipW = $state(220);
</script>

<div class="chart" bind:this={el} bind:clientWidth={width} bind:clientHeight={h}>
	<div
		class="plot"
		class:clickable={!!hotHref}
		role="slider"
		tabindex={times.length ? 0 : -1}
		aria-label="Every parameter against its target over time"
		aria-valuemin={times.length ? 1 : 0}
		aria-valuemax={times.length}
		aria-valuenow={times.length ? (active ?? times.length - 1) + 1 : 0}
		aria-valuetext={spoken}
		onpointermove={pointer.onpointermove}
		onpointerdown={pointer.onpointerdown}
		onpointerleave={pointer.onpointerleave}
		onclick={pointer.onclick}
		onkeydown={pointer.onkeydown}
	>
		<svg {width} height={h} viewBox="0 0 {width} {h}" aria-hidden="true">
			<rect x={LEFT} y={TOP} width={Math.max(0, width - LEFT - RIGHT)} height={bandTop - TOP} fill="var(--zone-bad)"></rect>
			<rect x={LEFT} y={bandBottom} width={Math.max(0, width - LEFT - RIGHT)} height={baseline - bandBottom} fill="var(--zone-bad)"></rect>
			<rect x={LEFT} y={bandTop} width={Math.max(0, width - LEFT - RIGHT)} height={bandBottom - bandTop} fill="var(--band)"></rect>
			<line x1={LEFT} x2={width - RIGHT} y1={bandTop} y2={bandTop} class="band-edge"></line>
			<line x1={LEFT} x2={width - RIGHT} y1={bandBottom} y2={bandBottom} class="band-edge"></line>
			{#each zones as z (z.title)}
				<text x={width - RIGHT + 8} y={z.y + 4} class="zone" class:bad={z.bad}>{z.title}</text>
			{/each}
			<ChartMarkerLines {markers} {x} top={TOP} {baseline} {selected} />
			{#if hotT != null}<line x1={x(hotT)} x2={x(hotT)} y1={TOP - 4} y2={baseline} class="guide"></line>{/if}
			{#each shown as l (l.id)}
				<g class="series" class:faded={focus != null && focus !== l.id} data-param={l.name}>
					{#if l.drawn.length > 1}
						<polyline
							class={l.style.dash ? 'dashed' : 'trace'}
							pathLength={l.style.dash ? undefined : 1}
							points={l.drawn.map((p) => `${x(p.t).toFixed(1)},${y(p.pos).toFixed(1)}`).join(' ')}
							fill="none"
							stroke={l.style.color}
							stroke-width={focus === l.id ? 3 : 2}
							stroke-linejoin="round"
						></polyline>
					{/if}
					{#each l.drawn as p, i (i)}
						<rect class="dot" x={x(p.t) - 4} y={y(p.pos) - 4} width="8" height="8" fill={l.style.color}></rect>
					{/each}
				</g>
			{/each}
			{#each hot as r (r.id)}
				<rect x={x(hotT!) - 6} y={y(r.pos) - 6} width="12" height="12" class="hot" fill={r.color}></rect>
			{/each}
			<ChartDateAxis {from} {to} {x} left={LEFT} right={RIGHT} {width} {baseline} height={h} {timeZone} titled />
		</svg>
		{#if hotT != null && hot.length}
			<ChartReadout latest={active === times.length - 1} href={hotHref} style="left:{tipLeft(x(hotT), tipW, width)}px;top:{TOP}px" wide bind:tipWidth={tipW}>
				<span class="r-when">{when(hotT)}</span>
				<ul class="rows">
					{#each [...hot].sort((a, b) => b.pos - a.pos) as r (r.id)}
						<li>
							<i class:dashed={r.dash} style:--key={r.color}></i><span class="r-name">{r.name}</span><span class="r-value num">{r.value}</span><span class="r-status status-{r.level}">{r.status}</span>
						</li>
					{/each}
				</ul>
			</ChartReadout>
		{/if}
	</div>
	<ChartMarkers {markers} {x} top={TOP} {width} {timeZone} {selected} {onselect} {popover} />
</div>

<style>
	.chart {
		position: relative;
		width: 100%;
		height: 100%;
		touch-action: pan-y;
		-webkit-tap-highlight-color: transparent;
	}
	.plot:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 4px;
	}
	.plot.clickable {
		cursor: pointer;
	}
	svg {
		display: block;
		overflow: visible;
	}
	.band-edge {
		stroke: var(--accent);
		stroke-width: 1;
		stroke-dasharray: 4 3;
	}
	.zone {
		fill: var(--text);
		font-size: 12px;
		font-weight: 800;
	}
	.zone.bad {
		fill: var(--accent-text);
	}
	.guide {
		stroke: var(--ink);
		stroke-opacity: 0.5;
	}
	.series {
		transition: opacity 0.15s;
	}
	.series.faded {
		opacity: 0.18;
	}
	/* a ring of the page around each point, where lines cross */
	.dot {
		stroke: var(--bg);
		stroke-width: 1.5;
	}
	.hot {
		stroke: var(--bg);
		stroke-width: 2;
	}
	.r-when {
		font-size: 13px;
		font-weight: 800;
		padding-bottom: 4px;
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: 10px auto auto auto;
		column-gap: 8px;
		row-gap: 3px;
		font-size: 13px;
	}
	.rows li {
		display: contents;
	}
	.rows li i {
		align-self: center;
		width: 10px;
		height: 10px;
		background: var(--key);
	}
	.rows li i.dashed {
		height: 4px;
		background: repeating-linear-gradient(to right, var(--key) 0 4px, transparent 4px 6px);
	}
	.r-value {
		font-weight: 800;
		text-align: right;
		white-space: nowrap;
	}
	.r-status {
		font-size: 12px;
		font-weight: 800;
		white-space: nowrap;
	}
	.trace {
		stroke-dasharray: 1;
		animation: draw 1.1s cubic-bezier(0.3, 0.6, 0.3, 1) both;
	}
	/* the eighth parameter on: the same hues, dashed */
	.dashed {
		stroke-dasharray: 6 3;
	}
	@keyframes draw {
		from {
			stroke-dashoffset: 1;
		}
		to {
			stroke-dashoffset: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.trace {
			animation: none;
		}
	}
</style>
