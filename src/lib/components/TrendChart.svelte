<script lang="ts" module>
	import type { OverlayKind } from '$lib/charts';
	export interface Marker {
		t: number;
		label: string;
		href: string;
		/** which event overlay it belongs to (#88): each draws its own glyph */
		kind?: OverlayKind | 'other';
	}

	// the arithmetic and words are in trend-chart.ts (#120); these two are used by name elsewhere
	export { nearestIndex, niceTicks } from './trend-chart';
</script>

<script lang="ts">
	// Trend chart (README → Charts): the target band as a neutral rect with its
	// limits labelled, the readings as a 2px ink line with square points (filled
	// accent when out of range), event markers (tap to open), and labelled axes:
	// the parameter and its unit up the side, dates along the bottom. Hover, tap
	// or drag (or the arrow keys) for a crosshair and a tooltip with the value,
	// the date and "✕ 15 over target"; a click (or Enter) opens that test.
	// Sized to its container so nothing distorts. `full` adds the points, the
	// axis titles, the limit labels and a popover for the chosen marker.
	import type { Snippet } from 'svelte';
	import { paramStatus, type StatusLevel } from '$lib/status';
	import { formatNumber } from '$lib/units';
	import { chartDomain } from '$lib/charts';
	import { axisTitle, hasLowZone, niceTicks, readoutStatus, readoutWhen, timeScale, tipStyle as placeTip, valueScale, zeroIsBest, zoneLabels as zonesFor } from './trend-chart';
	import { ChartPointer } from './chart-pointer.svelte';
	import ChartDateAxis from './ChartDateAxis.svelte';
	import ChartMarkerLines from './ChartMarkerLines.svelte';
	import ChartMarkers from './ChartMarkers.svelte';
	import ChartReadout from './ChartReadout.svelte';

	interface Point {
		t: number; // ms
		v: number; // display units
		/** the test this reading belongs to: a click opens it */
		href?: string;
	}
	/** Another parameter drawn beside the readings (#87), on its own scale. */
	interface CompareSeries {
		id: string;
		name: string;
		unit: string;
		decimals: number;
		points: Point[];
	}
	let {
		points,
		band,
		markers = [],
		from,
		to,
		lastLevel = 'ok',
		height = 132,
		label,
		name = '',
		unit = '',
		decimals = 1,
		timeZone,
		times = true,
		full = false,
		selected = null,
		onselect,
		popover,
		fit = false,
		pinLatest = false,
		sensor = [],
		compare = []
	}: {
		points: Point[];
		band: { min: number | null; max: number | null };
		markers?: Marker[];
		from: number;
		to: number;
		lastLevel?: StatusLevel;
		height?: number;
		label: string;
		/** for the side axis and the readout: "Nitrate", "ppm" */
		name?: string;
		unit?: string;
		decimals?: number;
		/** the keeper's time zone, for dates and times */
		timeZone?: string;
		/** false: dates only (the public page's charts are by day) */
		times?: boolean;
		full?: boolean;
		selected?: string | null;
		onselect?: (m: Marker) => void;
		popover?: Snippet<[Marker]>;
		/** Take the height from the container (set it in CSS) instead of `height`. */
		fit?: boolean;
		/** Keep a small tooltip on the latest reading while nothing is pointed at (phones). */
		pinLatest?: boolean;
		/** readings from a sensor (#19), drawn as a thin neutral line under the tests */
		sensor?: { t: number; v: number; lo?: number; hi?: number }[];
		/** up to two more parameters (#87): dashed lines on their own scales, the first with an axis on the right */
		compare?: CompareSeries[];
	} = $props();

	let el = $state<HTMLDivElement>();
	let width = $state(320);
	let measured = $state(0);
	const h = $derived(fit && measured > 0 ? measured : height);
	const TOP = 22; // room for marker squares
	// the date ticks, and under them the "Date" title on a full chart
	const BOTTOM = $derived(full ? 40 : 22);
	const plotH = $derived(Math.max(1, h - TOP - BOTTOM));

	// room past the target on both sides, so it's a band and never the whole chart (#74)
	// a sensor's lowest and highest count too, so a spike stays on the chart (#103)
	const domain = $derived(chartDomain([...points.map((p) => p.v), ...sensor.flatMap((s) => [s.v, s.lo ?? s.v, s.hi ?? s.v])], band));
	// the spread of each span of sensor samples, as a faint band behind its line
	const sensorBand = $derived(
		sensor.length > 1 && sensor.some((s) => s.lo != null && s.hi != null && s.hi > s.lo)
			? [...sensor.map((s) => `${x(s.t)},${y(s.hi ?? s.v)}`), ...[...sensor].reverse().map((s) => `${x(s.t)},${y(s.lo ?? s.v)}`)].join(' ')
			: null
	);

	// fewer numbers up the side of a short chart
	const ticks = $derived(niceTicks(domain.lo, domain.hi, plotH < 70 ? 2 : plotH < 200 ? 3 : 4));
	const tickText = (v: number) => String(v);
	// "Nitrate (ppm)" up the side; just the unit when a short chart has no room for the rest
	const title = $derived(axisTitle(name, unit, plotH));
	const LEFT = $derived((title ? 18 : 4) + Math.max(1, ...ticks.map((t) => tickText(t).length)) * 7 + 8);
	// a full chart names its zones in a gutter on the right (#74); when comparing,
	// the first compared parameter's axis takes that side instead (the band and the legend still say the target)
	const zoned = $derived(full && (band.min != null || band.max != null) && !compare.length);
	// each compared parameter's own scale, so a pH line and a nitrate line share the plot
	const scales = $derived(
		compare.map((c) => {
			const d = chartDomain(c.points.map((p) => p.v), { min: null, max: null });
			return { ...c, domain: d, ticks: niceTicks(d.lo, d.hi, plotH < 200 ? 3 : 4) };
		})
	);
	const axis2 = $derived(full && scales.length ? scales[0] : null);
	const axis2Title = $derived(axis2 ? (axis2.unit ? `${axis2.name} (${axis2.unit})` : axis2.name) : '');
	const RIGHT = $derived(axis2 ? Math.max(1, ...axis2.ticks.map((t) => String(t).length)) * 7 + 8 + (axis2Title.length * 6.5 <= plotH ? 18 : 6) : zoned ? (width < 480 ? 74 : 92) : 10);
	// the lowest value sits a little above the axis, so a run of zeros isn't hidden under it
	const LIFT = 8;

	const x = $derived(timeScale(from, to, LEFT, RIGHT, width));
	const y = $derived(valueScale(domain, TOP, plotH - LIFT));
	const y2 = (v: number, d: { lo: number; hi: number }) => valueScale(d, TOP, plotH - LIFT)(v);
	/** a compared parameter's reading from the same test as `p` (the same instant), for the readout */
	const alongside = (p: Point) => scales.flatMap((c) => {
		const m = c.points.find((q) => q.t === p.t);
		return m ? [`${c.name} ${formatNumber(m.v, c.decimals)}${c.unit ? ` ${c.unit}` : ''}`] : [];
	});

	const line = $derived(points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '));
	const last = $derived(points.at(-1));
	const bandTop = $derived(band.max != null ? y(band.max) : TOP);
	const bandBottom = $derived(band.min != null ? y(band.min) : h - BOTTOM);
	const hasBand = $derived(band.min != null || band.max != null);
	const baseline = $derived(h - BOTTOM);
	const zeroBest = $derived(zeroIsBest(band));
	const lowZone = $derived(hasLowZone(band));
	const zoneRight = $derived(width - RIGHT + 8);
	/** The zones' labels in the gutter, where they fit */
	const zoneLabels = $derived(zoned ? zonesFor(band, decimals, { top: TOP, bandTop, bandBottom, baseline, zero: y(0) }) : []);

	// The readout: the reading nearest the pointer, or picked with the keys
	const pointer = new ChartPointer({
		el: () => el,
		xs: () => points.map((p) => x(p.t)),
		href: (): string | undefined => hot?.href,
		series: () => points
	});
	const active = $derived(pointer.active);
	const hot = $derived(active != null ? (points[active] ?? null) : null);
	const shown = $derived(active ?? points.length - 1);
	// nothing pointed at: a small tooltip stays on the latest reading
	const pinned = $derived(pinLatest && active == null && last ? last : null);
	const when = (t: number) => readoutWhen(t, timeZone, times);
	const value = (p: Point) => `${formatNumber(p.v, decimals)}${unit ? ` ${unit}` : ''}`;
	const level = (p: Point): StatusLevel => (hasBand ? paramStatus(p.v, band).level : 'ok');
	/** "✕ 15 over target", "▲ Near high", "✓ In range"; "" without a target */
	const status = (p: Point) => readoutStatus(p.v, band, decimals);
	const spoken = (p: Point | undefined) => (p ? `${when(p.t)}: ${value(p)}${status(p) ? `, ${status(p).replace(/^\S+ /, '')}` : ''}` : 'No readings');

	// the line draws itself the first time the chart is in view; one below the
	// fold waits for it (without scripts, or with reduced motion, it's simply there)
	let waiting = $state(false);
	$effect(() => {
		if (!el || typeof IntersectionObserver === 'undefined') return;
		const box = el.getBoundingClientRect();
		if (box.top < innerHeight && box.bottom > 0) return;
		waiting = true;
		const io = new IntersectionObserver((seen) => {
			if (seen.some((e) => e.isIntersecting)) {
				waiting = false;
				io.disconnect();
			}
		});
		io.observe(el);
		return () => io.disconnect();
	});
	/** The tooltip's place: beside the reading, flipped inside the chart's edges. */
	const tipStyle = (p: Point) => placeTip(x(p.t), y(p.v), width);
</script>

<!-- the slider is the plot; the markers are beside it, not inside, so each is its own control -->
<div class="chart" class:fit class:waiting bind:this={el} bind:clientWidth={width} bind:clientHeight={measured}>
	<div
		class="plot"
		class:clickable={!!hot?.href}
		role="slider"
		tabindex={points.length ? 0 : -1}
		aria-label={label}
		aria-valuemin={points.length ? 1 : 0}
		aria-valuemax={points.length}
		aria-valuenow={points.length ? shown + 1 : 0}
		aria-valuetext={spoken(points[shown])}
		onpointermove={pointer.onpointermove}
		onpointerdown={pointer.onpointerdown}
		onpointerleave={pointer.onpointerleave}
		onclick={pointer.onclick}
		onkeydown={pointer.onkeydown}
	>
		<svg {width} height={h} viewBox="0 0 {width} {h}" aria-hidden="true">
			{#if title}
				<text class="axis-title" transform="translate(11 {TOP + plotH / 2}) rotate(-90)" text-anchor="middle">{title}</text>
			{/if}
			{#if hasBand}
				<!-- High and Low as a faint red either side of the target (#74) -->
				{#if band.max != null && bandTop > TOP}<rect x={LEFT} y={TOP} width={Math.max(0, width - LEFT - RIGHT)} height={bandTop - TOP} fill="var(--zone-bad)"></rect>{/if}
				{#if lowZone && baseline > bandBottom}<rect x={LEFT} y={bandBottom} width={Math.max(0, width - LEFT - RIGHT)} height={baseline - bandBottom} fill="var(--zone-bad)"></rect>{/if}
				<rect x={LEFT} y={bandTop} width={Math.max(0, width - LEFT - RIGHT)} height={Math.max(0, bandBottom - bandTop)} fill="var(--band)"></rect>
			{/if}
			{#each ticks as t (t)}
				<line x1={LEFT} x2={width - RIGHT} y1={y(t)} y2={y(t)} class="grid"></line>
				<text x={LEFT - 6} y={y(t) + 4} class="axis" text-anchor="end">{tickText(t)}</text>
			{/each}
			{#if hasBand}
				{#if band.max != null}<line x1={LEFT} x2={width - RIGHT} y1={bandTop} y2={bandTop} class="band-edge"></line>{/if}
				{#if lowZone}<line x1={LEFT} x2={width - RIGHT} y1={bandBottom} y2={bandBottom} class="band-edge"></line>{/if}
				{#if zeroBest}<line x1={LEFT} x2={width - RIGHT} y1={y(0)} y2={y(0)} class="zero-line"></line>{/if}
				{#each zoneLabels as z (z.title)}
					<text x={zoneRight} y={z.y + (z.sub && z.room >= 30 ? -2 : 4)} class="zone" class:bad={z.bad}>{z.title}</text>
					{#if z.sub && z.room >= 30}<text x={zoneRight} y={z.y + 12} class="zone-sub">{z.sub}</text>{/if}
				{/each}
			{/if}
			<ChartMarkerLines {markers} {x} top={TOP} {baseline} {selected} />
			{#if hot}<line x1={x(hot.t)} x2={x(hot.t)} y1={TOP - 4} y2={baseline} class="guide"></line>{/if}
			{#if pinned}<line x1={x(pinned.t)} x2={x(pinned.t)} y1={TOP - 4} y2={baseline} class="guide"></line>{/if}
			{#if sensorBand}
				<polygon class="sensor-band" points={sensorBand} fill="var(--neutral-600)" fill-opacity="0.16" stroke="none"></polygon>
			{/if}
			{#if sensor.length > 1}
				<polyline class="sensor" points={sensor.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')} fill="none" stroke="var(--neutral-600)" stroke-width="1.25" stroke-linejoin="round"></polyline>
			{:else if sensor.length === 1}
				<!-- a sensor's first reading, before there's a line to draw -->
				<rect class="sensor-dot" x={x(sensor[0].t) - 2.5} y={y(sensor[0].v) - 2.5} width="5" height="5" fill="var(--neutral-600)"></rect>
			{/if}
			{#each scales as c, i (c.id)}
				<polyline class="compare c{i + 1}" points={c.points.map((p) => `${x(p.t).toFixed(1)},${y2(p.v, c.domain).toFixed(1)}`).join(' ')} fill="none" stroke-linejoin="round"></polyline>
				{#if full}
					{#each c.points as p (p.t)}
						<rect class="compare-dot c{i + 1}" x={x(p.t) - 2.5} y={y2(p.v, c.domain) - 2.5} width="5" height="5"></rect>
					{/each}
				{/if}
			{/each}
			{#if axis2}
				{#each axis2.ticks as t (t)}
					<text x={width - RIGHT + 6} y={y2(t, axis2.domain) + 4} class="axis axis2">{t}</text>
				{/each}
				{#if axis2Title.length * 6.5 <= plotH}
					<text class="axis-title axis2" transform="translate({width - 6} {TOP + plotH / 2}) rotate(90)" text-anchor="middle">{axis2Title}</text>
				{/if}
			{/if}
			<polyline class="trace" pathLength="1" points={line} fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"></polyline>
			{#if full}
				{#each points as p, i (i)}
					{#if i !== points.length - 1}
						<rect x={x(p.t) - 3} y={y(p.v) - 3} width="6" height="6" fill={level(p) === 'bad' ? 'var(--accent)' : 'var(--ink)'}></rect>
					{/if}
				{/each}
			{/if}
			{#if last}
				<rect class="last-dot" x={x(last.t) - 5} y={y(last.v) - 5} width="10" height="10" fill={lastLevel === 'ok' ? 'var(--ink)' : 'var(--accent)'}></rect>
			{/if}
			{#if full && last && !hot && !pinLatest}
				<!-- the latest reading's value beside it (#74) -->
				<text x={x(last.t) - 9} y={y(last.v) - 10 < TOP + 4 ? y(last.v) + 20 : y(last.v) - 10} class="last-value" class:bad={lastLevel === 'bad'} text-anchor="end">{value(last)}</text>
			{/if}
			{#if hot}<rect x={x(hot.t) - 6} y={y(hot.v) - 6} width="12" height="12" class="hot"></rect>{/if}
			<ChartDateAxis {from} {to} {x} left={LEFT} right={RIGHT} {width} {baseline} height={h} {timeZone} titled={full} />
		</svg>
		{#if hot}
			<ChartReadout latest={active === points.length - 1} href={hot.href} style={tipStyle(hot)}>
				<span class="r-value status-{level(hot)}">{value(hot)}</span>
				<span class="r-when">{when(hot.t)}{status(hot) ? ` · ${status(hot)}` : ''}</span>
				{#each alongside(hot) as line (line)}<span class="r-also">{line}</span>{/each}
			</ChartReadout>
		{:else if pinned}
			<div class="readout pinned" style="left:{Math.min(x(pinned.t), width - 8)}px;top:{y(pinned.v) - 10}px">
				<span class="r-value status-{level(pinned)}">{value(pinned)}</span> · {when(pinned.t).split(' · ')[0]}
				{#if status(pinned)}<br />{status(pinned)}{/if}
			</div>
		{/if}
	</div>
	<ChartMarkers {markers} {x} top={TOP} {width} {timeZone} {selected} {onselect} {popover} />
	<!-- the readings as a table, for screen readers (#267): the picture is hidden from them -->
	{#if points.length}
		<table class="sr-only">
			<caption>{label}</caption>
			<thead><tr><th scope="col">When</th><th scope="col">Reading</th></tr></thead>
			<tbody>
				{#each points as p, i (i)}
					<tr><td>{when(p.t)}</td><td>{value(p)}{status(p) ? `, ${status(p).replace(/^\S+ /, '')}` : ''}</td></tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.chart {
		position: relative;
		width: 100%;
		/* a finger drags along the line; the page still scrolls up and down */
		touch-action: pan-y;
		-webkit-tap-highlight-color: transparent;
	}
	.chart.fit {
		height: 100%;
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
	.grid {
		stroke: var(--divider);
		stroke-dasharray: 2 4;
	}
	/* the target's limits, where High and Low begin */
	.band-edge {
		stroke: var(--accent);
		stroke-width: 1;
		stroke-dasharray: 4 3;
	}
	.zero-line {
		stroke: var(--ink);
		stroke-width: 1;
	}
	.zone {
		fill: var(--text);
		font-size: 12px;
		font-weight: 800;
	}
	.zone.bad {
		fill: var(--accent-text);
	}
	.zone-sub {
		fill: var(--text-muted);
		font-size: 11px;
	}
	.last-value {
		fill: var(--text);
		font-size: 12px;
		font-weight: 800;
		stroke: var(--bg);
		stroke-width: 3px;
		paint-order: stroke;
	}
	.last-value.bad {
		fill: var(--accent-text);
	}
	.axis {
		fill: var(--text-muted);
		font-size: 12px;
	}
	/* compared parameters (#87): dashed for the first, dotted for the second, never the accent (that means status) */
	.compare {
		stroke: var(--text-2);
		stroke-width: 1.5;
	}
	.compare.c1 {
		stroke-dasharray: 6 4;
	}
	.compare.c2 {
		stroke-dasharray: 1.5 3.5;
		stroke-linecap: round;
	}
	.compare-dot {
		fill: var(--bg);
		stroke: var(--text-2);
		stroke-width: 1.25;
	}
	.axis2 {
		fill: var(--text-2);
	}
	.axis-title {
		fill: var(--text-2);
		font-size: 12px;
		font-weight: 700;
	}
	/* the crosshair and the reading being read out */
	.guide {
		stroke: var(--accent);
		stroke-opacity: 0.6;
	}
	.hot {
		fill: var(--accent);
		stroke: var(--bg);
		stroke-width: 2;
	}
	.r-also {
		display: block;
		font-size: 12px;
		color: var(--text-2);
	}
	.r-value {
		font-size: 18px;
		font-weight: 800;
		white-space: nowrap;
	}
	.r-when {
		font-size: 13px;
		white-space: nowrap;
	}
	/* the small tooltip pinned to the latest reading */
	.pinned {
		position: absolute;
		z-index: 3;
		width: max-content;
		max-width: 170px;
		padding: 6px 8px;
		transform: translate(-100%, -100%);
		background: var(--ink);
		color: var(--bg);
		font-size: 12px;
		line-height: 1.3;
		pointer-events: none;
	}
	.pinned .r-value {
		font-size: 12px;
		color: inherit !important;
	}
	/* the reading line draws itself in, then the latest reading pops up */
	.trace {
		stroke-dasharray: 1;
		animation: draw 1.1s cubic-bezier(0.3, 0.6, 0.3, 1) both;
	}
	.last-dot {
		transform-box: fill-box;
		transform-origin: center;
		animation: pop 0.35s ease-out 1s both;
	}
	.waiting .trace,
	.waiting .last-dot {
		animation-play-state: paused;
	}
	@keyframes draw {
		from {
			stroke-dashoffset: 1;
		}
		to {
			stroke-dashoffset: 0;
		}
	}
	@keyframes pop {
		from {
			transform: scale(0);
		}
		70% {
			transform: scale(1.3);
		}
		to {
			transform: scale(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.trace,
		.last-dot {
			animation: none;
		}
	}
</style>
