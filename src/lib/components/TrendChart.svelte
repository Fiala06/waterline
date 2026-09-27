<script lang="ts" module>
	export interface Marker {
		t: number;
		label: string;
		href: string;
		kind?: 'water_change' | 'dosing' | 'other';
	}
</script>

<script lang="ts">
	// Trend chart: target band, reading line, event markers (tap to open), and the
	// latest point colored by status. Sized to its container so nothing distorts.
	// The y-axis says what's plotted ("Nitrate (ppm)"), dates run along the bottom,
	// and hovering, tapping or the arrow keys show a reading's value and time.
	// `full` adds dots on every reading and a popover for the chosen marker.
	import type { Snippet } from 'svelte';
	import type { StatusLevel } from '$lib/status';
	import { niceTicks, yAxisTitle } from '$lib/charts';
	import { formatNumber } from '$lib/units';

	interface Point {
		t: number; // ms
		v: number; // display units
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
		full = false,
		selected = null,
		onselect,
		popover,
		fit = false,
		name = '',
		unit = '',
		format = (v: number) => formatNumber(v, 2),
		when
	}: {
		points: Point[];
		band: { min: number | null; max: number | null };
		markers?: Marker[];
		from: number;
		to: number;
		lastLevel?: StatusLevel;
		height?: number;
		label: string;
		full?: boolean;
		selected?: string | null;
		onselect?: (m: Marker) => void;
		popover?: Snippet<[Marker]>;
		/** Take the height from the container (set it in CSS) instead of `height`. */
		fit?: boolean;
		/** the parameter, for the y-axis and a reading's value */
		name?: string;
		unit?: string;
		/** a reading's value (display units) as shown elsewhere, e.g. "7.54" */
		format?: (v: number) => string;
		/** a reading's date and time, e.g. "Sep 24, 8:14 AM" (public pages: the date only) */
		when?: (t: number) => string;
	} = $props();

	let width = $state(320);
	let measured = $state(0);
	const h = $derived(fit && measured > 0 ? measured : height);
	const TOP = 22; // room for marker dots
	const BOTTOM = 20;

	const domain = $derived.by(() => {
		const vals = points.map((p) => p.v);
		if (band.min != null) vals.push(band.min);
		if (band.max != null) vals.push(band.max);
		let lo = Math.min(...vals);
		let hi = Math.max(...vals);
		if (!Number.isFinite(lo)) return { lo: 0, hi: 1 };
		if (hi === lo) {
			hi += 1;
			lo -= 1;
		}
		const pad = (hi - lo) * 0.12;
		return { lo: lo >= 0 ? Math.max(0, lo - pad) : lo - pad, hi: hi + pad };
	});

	const plotH = $derived(h - TOP - BOTTOM);

	// 3 or so ticks on a small chart, 4 or so on a tall one
	const ticks = $derived(niceTicks(domain.lo, domain.hi, plotH < 140 ? 3 : 4));
	// The y-axis title reads up the side, fitted to the chart's height.
	const CHAR = 6.8; // px per character at 12px, roughly
	const axisTitle = $derived(yAxisTitle(name, unit, Math.floor(plotH / CHAR)));
	const TITLE = $derived(axisTitle ? 18 : 0);
	const LEFT = $derived(TITLE + Math.max(10, Math.max(0, ...ticks.map((t) => String(t).length)) * CHAR + 8));

	const xTicks = $derived.by(() => {
		const n = Math.max(2, Math.min(5, Math.floor(width / 110)));
		return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
	});

	const x = (t: number) => LEFT + ((t - from) / Math.max(1, to - from)) * (width - LEFT - 10);
	const y = (v: number) => TOP + (1 - (v - domain.lo) / (domain.hi - domain.lo)) * (h - TOP - BOTTOM);

	const line = $derived(points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '));
	const last = $derived(points.at(-1));
	const bandTop = $derived(band.max != null ? y(band.max) : TOP);
	const bandBottom = $derived(band.min != null ? y(band.min) : h - BOTTOM);
	const hasBand = $derived(band.min != null || band.max != null);

	const fmt = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	const isToday = (t: number) => Math.abs(t - Date.now()) < 43_200_000;
	const chosen = $derived(markers.find((m) => m.href === selected) ?? null);

	// The reading being read: under the mouse, last tapped, or picked with the arrow keys.
	let active = $state<number | null>(null);
	let box = $state<HTMLDivElement>();
	const reading = $derived(active == null ? null : (points[active] ?? null));
	const whenOf = (t: number) => (when ? when(t) : fmt(t));
	const readingText = (p: Point) => {
		const value = format(p.v);
		return unit ? `${value} ${unit}` : name ? `${name} ${value}` : value;
	};

	function nearest(clientX: number) {
		const px = clientX - (box?.getBoundingClientRect().left ?? 0);
		let best = 0;
		points.forEach((p, i) => {
			if (Math.abs(x(p.t) - px) < Math.abs(x(points[best].t) - px)) best = i;
		});
		return best;
	}
	// markers and their popover keep their own taps
	const onMarker = (e: Event) => !!(e.target as Element).closest?.('.marker, .pop');

	function pointerMove(e: PointerEvent) {
		if (!points.length) return;
		if (onMarker(e)) {
			if (e.pointerType === 'mouse') active = null;
			return;
		}
		// a mouse reads as it moves; a finger reads while it slides along the chart
		if (e.pointerType === 'mouse' || e.buttons) active = nearest(e.clientX);
	}
	function pointerDown(e: PointerEvent) {
		if (points.length && !onMarker(e)) active = nearest(e.clientX);
	}
	function pointerLeave(e: PointerEvent) {
		if (e.pointerType === 'mouse') active = null;
	}
	/** A tap anywhere else puts the reading away. */
	function windowDown(e: PointerEvent) {
		if (active != null && box && !box.contains(e.target as Node)) active = null;
	}
	function key(e: KeyboardEvent) {
		if (!points.length) return;
		const last = points.length - 1;
		const next =
			e.key === 'ArrowLeft' ? (active == null ? last : Math.max(0, active - 1))
			: e.key === 'ArrowRight' ? (active == null ? last : Math.min(last, active + 1))
			: e.key === 'Home' ? 0
			: e.key === 'End' ? last
			: undefined;
		if (next !== undefined) {
			e.preventDefault();
			active = next;
		} else if (e.key === 'Escape' && active != null) {
			e.stopPropagation();
			active = null;
		}
	}
</script>

<svelte:window onpointerdown={windowDown} />

<!-- A group, not a slider: the marker buttons inside it stay their own controls. The arrow keys read it, announced below. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	class="chart"
	class:fit
	class:reading={reading != null}
	bind:this={box}
	bind:clientWidth={width}
	bind:clientHeight={measured}
	role="group"
	aria-label="{label}{points.length ? '. Use the arrow keys to read each test.' : ''}"
	tabindex={points.length ? 0 : undefined}
	onpointermove={pointerMove}
	onpointerdown={pointerDown}
	onpointerleave={pointerLeave}
	onkeydown={key}
	onblur={() => (active = null)}
>
	<svg {width} height={h} viewBox="0 0 {width} {h}" aria-hidden="true">
		{#if axisTitle}
			<text class="axis-title" transform="rotate(-90)" x={-(TOP + plotH / 2)} y="12" text-anchor="middle">{axisTitle}</text>
		{/if}
		{#each ticks as t (t)}
			<line x1={LEFT} x2={width} y1={y(t)} y2={y(t)} class="grid"></line>
			<text x={LEFT - 6} y={y(t) + 4} class="axis" text-anchor="end">{t}</text>
		{/each}
		{#if hasBand}
			<rect x={LEFT} y={bandTop} width={Math.max(0, width - LEFT)} height={Math.max(0, bandBottom - bandTop)} fill="var(--band)"></rect>
			{#if band.max != null}<line x1={LEFT} x2={width} y1={bandTop} y2={bandTop} class="band-edge"></line>{/if}
			{#if band.min != null}<line x1={LEFT} x2={width} y1={bandBottom} y2={bandBottom} class="band-edge"></line>{/if}
		{/if}
		{#each markers as m (m.href)}
			<line
				x1={x(m.t)}
				x2={x(m.t)}
				y1={TOP - 10}
				y2={h - BOTTOM}
				class="marker-line"
				class:dosing={m.kind === 'dosing'}
				class:chosen={m.href === selected}
			></line>
		{/each}
		<polyline points={line} fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"></polyline>
		{#if full}
			{#each points as p, i (i)}<circle cx={x(p.t)} cy={y(p.v)} r="2.5" fill="var(--accent)"></circle>{/each}
		{/if}
		{#if last}
			<circle
				cx={x(last.t)}
				cy={y(last.v)}
				r="4.5"
				fill={lastLevel === 'bad' ? 'var(--bad)' : lastLevel === 'warn' ? 'var(--warn)' : 'var(--accent)'}
			></circle>
		{/if}
		{#if reading}
			<line x1={x(reading.t)} x2={x(reading.t)} y1={TOP} y2={h - BOTTOM} class="guide"></line>
			<circle cx={x(reading.t)} cy={y(reading.v)} r="6" class="ring"></circle>
		{/if}
		<line x1={LEFT} x2={width} y1={h - BOTTOM} y2={h - BOTTOM} stroke="var(--border)"></line>
		{#each xTicks as t, i (i)}
			<text
				x={i === 0 ? LEFT : i === xTicks.length - 1 ? width : x(t)}
				y={h - 4}
				class="axis"
				text-anchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
				>{i === xTicks.length - 1 && isToday(t) ? 'Today' : fmt(t)}</text
			>
		{/each}
	</svg>
	{#each markers as m (m.href)}
		{#if onselect}
			<button
				type="button"
				class="marker"
				class:dosing={m.kind === 'dosing'}
				class:chosen={m.href === selected}
				style:left="{x(m.t)}px"
				style:top="{TOP - 10}px"
				aria-label="{m.label}, {fmt(m.t)}"
				aria-pressed={m.href === selected}
				onclick={() => onselect(m)}
			></button>
		{:else}
			<a class="marker" class:dosing={m.kind === 'dosing'} href={m.href} style:left="{x(m.t)}px" style:top="{TOP - 10}px" title={m.label} aria-label="{m.label}, {fmt(m.t)}"></a>
		{/if}
	{/each}
	{#if reading}
		{@const below = y(reading.v) < 56}
		<div
			class="tip"
			class:below
			style:left="{Math.min(Math.max(x(reading.t), 64), width - 64)}px"
			style:top="{y(reading.v) + (below ? 12 : -12)}px"
		>
			<strong>{readingText(reading)}</strong>
			<span>{whenOf(reading.t)}</span>
		</div>
	{/if}
	<p class="sr-only" aria-live="polite">{reading ? `${readingText(reading)}, ${whenOf(reading.t)}` : ''}</p>
	{#if chosen && popover}
		<div class="pop" style:left="{Math.min(Math.max(x(chosen.t) - 80, 0), width - 180)}px" style:top="{TOP + 4}px">
			{@render popover(chosen)}
		</div>
	{/if}
</div>

<style>
	.chart {
		position: relative;
		width: 100%;
	}
	.chart.fit {
		height: 100%;
	}
	.chart {
		/* sliding a finger along the chart reads it; up and down still scrolls */
		touch-action: pan-y;
		border-radius: 8px;
	}
	.chart:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 4px;
	}
	svg {
		display: block;
		overflow: visible;
	}
	.grid {
		stroke: var(--divider-soft);
	}
	.band-edge {
		stroke: var(--accent);
		stroke-opacity: 0.35;
		stroke-dasharray: 2 3;
	}
	.marker-line {
		stroke: var(--text-muted);
		stroke-opacity: 0.6;
		stroke-dasharray: 3 3;
	}
	.marker-line.dosing {
		stroke-dasharray: 1 3;
	}
	.marker-line.chosen {
		stroke: var(--text);
		stroke-opacity: 1;
		stroke-dasharray: none;
		stroke-width: 1.5;
	}
	.axis {
		fill: var(--text-faint);
		font-size: 12px;
	}
	.axis-title {
		fill: var(--text-muted);
		font-size: 12px;
	}
	.guide {
		stroke: var(--text-muted);
		stroke-opacity: 0.7;
	}
	.ring {
		fill: none;
		stroke: var(--text);
		stroke-width: 2;
	}
	.tip {
		position: absolute;
		z-index: 3;
		transform: translate(-50%, -100%);
		pointer-events: none;
		white-space: nowrap;
		border-radius: 10px;
		background: var(--bg);
		border: 1px solid var(--border-strong);
		padding: 6px 10px;
		box-shadow: var(--shadow-toast);
		font-size: 13px;
		line-height: 1.35;
		text-align: center;
	}
	.tip.below {
		transform: translate(-50%, 0);
	}
	.tip strong {
		display: block;
		font-size: 15px;
		color: var(--text);
	}
	.tip span {
		color: var(--text-muted);
	}
	.marker {
		position: absolute;
		width: 14px;
		height: 14px;
		margin: -7px 0 0 -7px;
		padding: 0;
		border-radius: 50%;
		background: var(--border);
		border: 1px solid var(--text-muted);
	}
	.marker.dosing {
		border-radius: 3px;
		transform: rotate(45deg) scale(0.85);
	}
	.marker::before {
		/* bigger tap target */
		content: '';
		position: absolute;
		inset: -15px;
	}
	.marker:hover,
	.marker:focus-visible,
	.marker.chosen {
		background: var(--accent);
	}
	.pop {
		position: absolute;
		width: 180px;
		z-index: 2;
		border-radius: 12px;
		background: var(--bg);
		border: 1px solid var(--border-strong);
		padding: 10px 12px;
		box-shadow: var(--shadow-toast);
	}
</style>
