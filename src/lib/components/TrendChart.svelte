<script lang="ts" module>
	export interface Marker {
		t: number;
		label: string;
		href: string;
		kind?: 'water_change' | 'dosing' | 'other';
	}

	/** About `count` round values across lo…hi, for the side axis; never fewer than two. */
	export function niceTicks(lo: number, hi: number, count: number): number[] {
		const span = hi - lo;
		if (!(span > 0) || count < 1) return [];
		const raw = span / count;
		const mag = 10 ** Math.floor(Math.log10(raw));
		const steps = [0.5, 1, 2, 2.5, 5, 10].map((m) => m * mag);
		const within = (step: number) => {
			const out: number[] = [];
			for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6 || 0);
			return out;
		};
		// the round step nearest the ideal one, then a smaller one if that leaves just one number
		const i = steps.reduce((best, s, j) => (Math.abs(Math.log(s / raw)) < Math.abs(Math.log(steps[best] / raw)) ? j : best), 0);
		const out = within(steps[i]);
		return out.length >= 2 || i === 0 ? out : within(steps[i - 1]);
	}

	/** Which of the points (their x positions, left to right) is nearest to px. */
	export function nearestIndex(xs: number[], px: number): number {
		let lo = 0;
		let hi = xs.length - 1;
		while (hi - lo > 1) {
			const mid = (lo + hi) >> 1;
			if (xs[mid] < px) lo = mid;
			else hi = mid;
		}
		return Math.abs(xs[hi] - px) < Math.abs(xs[lo] - px) ? hi : lo;
	}
</script>

<script lang="ts">
	// Trend chart: target band, reading line, event markers (tap to open), the
	// latest point colored by status, and axes: the parameter and its unit up
	// the side, dates along the bottom. Hover, tap or drag (or the arrow keys)
	// for a reading's value, status and when it was taken. Sized to its
	// container so nothing distorts. `full` adds a dot per reading and a
	// popover for the chosen marker.
	import type { Snippet } from 'svelte';
	import { paramStatus, statusShort, type StatusLevel } from '$lib/status';
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
		name = '',
		unit = '',
		decimals = 1,
		timeZone,
		times = true,
		full = false,
		selected = null,
		onselect,
		popover,
		fit = false
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
		/** false: dates only (public pages never show times) */
		times?: boolean;
		full?: boolean;
		selected?: string | null;
		onselect?: (m: Marker) => void;
		popover?: Snippet<[Marker]>;
		/** Take the height from the container (set it in CSS) instead of `height`. */
		fit?: boolean;
	} = $props();

	let el = $state<HTMLDivElement>();
	let width = $state(320);
	let measured = $state(0);
	const h = $derived(fit && measured > 0 ? measured : height);
	const TOP = 22; // room for marker dots
	const BOTTOM = 22;
	const plotH = $derived(Math.max(1, h - TOP - BOTTOM));

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

	// fewer numbers up the side of a short chart
	const ticks = $derived(niceTicks(domain.lo, domain.hi, plotH < 70 ? 2 : plotH < 200 ? 3 : 4));
	const tickText = (v: number) => String(v);
	// "Nitrate (ppm)" up the side; just the unit when a short chart has no room for the rest
	const title = $derived.by(() => {
		const long = name ? (unit ? `${name} (${unit})` : name) : unit;
		return long.length * 6.5 <= plotH ? long : unit || name;
	});
	const LEFT = $derived((title ? 18 : 4) + Math.max(1, ...ticks.map((t) => tickText(t).length)) * 7 + 8);

	const x = (t: number) => LEFT + ((t - from) / Math.max(1, to - from)) * (width - LEFT - 10);
	const y = (v: number) => TOP + (1 - (v - domain.lo) / (domain.hi - domain.lo)) * plotH;

	const xTicks = $derived.by(() => {
		const n = Math.max(2, Math.min(5, Math.floor((width - LEFT) / 90)));
		return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
	});

	const line = $derived(points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '));
	const last = $derived(points.at(-1));
	const bandTop = $derived(band.max != null ? y(band.max) : TOP);
	const bandBottom = $derived(band.min != null ? y(band.min) : h - BOTTOM);
	const hasBand = $derived(band.min != null || band.max != null);

	const fmt = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
	const isToday = (t: number) => Math.abs(t - Date.now()) < 43_200_000;
	const chosen = $derived(markers.find((m) => m.href === selected) ?? null);

	// The readout: the reading nearest the pointer, or picked with the keys
	let active = $state<number | null>(null);
	const hot = $derived(active != null ? (points[active] ?? null) : null);
	const shown = $derived(active ?? points.length - 1);
	const when = (t: number) => {
		const d = new Date(t);
		const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone });
		return times ? `${day} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })}` : day;
	};
	const value = (p: Point) => `${formatNumber(p.v, decimals)}${unit ? ` ${unit}` : ''}`;
	/** "✕ High", when there's a target to measure against */
	const status = (p: Point) => (hasBand ? { level: paramStatus(p.v, band).level, text: statusShort(paramStatus(p.v, band)) } : null);
	const spoken = (p: Point | undefined) => (p ? `${when(p.t)}: ${value(p)}${status(p) ? `, ${status(p)!.text.replace(/^\S+ /, '')}` : ''}` : 'No readings');

	const onMarker = (e: Event) => !!(e.target as Element | null)?.closest?.('.marker, .pop');
	function showAt(clientX: number) {
		if (!el || !points.length) return;
		active = nearestIndex(
			points.map((p) => x(p.t)),
			clientX - el.getBoundingClientRect().left
		);
	}
	function onpointermove(e: PointerEvent) {
		// a mouse just hovers; a finger or pen drags along the line
		if (!onMarker(e) && (e.pointerType === 'mouse' || e.buttons)) showAt(e.clientX);
	}
	function onpointerdown(e: PointerEvent) {
		if (!onMarker(e)) showAt(e.clientX);
	}
	function onpointerleave(e: PointerEvent) {
		if (e.pointerType === 'mouse') active = null;
	}
	function onkeydown(e: KeyboardEvent) {
		const end = points.length - 1;
		if (end < 0) return;
		if (e.key === 'ArrowRight' || e.key === 'ArrowUp') active = Math.min(end, (active ?? -1) + 1);
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') active = Math.max(0, (active ?? end + 1) - 1);
		else if (e.key === 'Home') active = 0;
		else if (e.key === 'End') active = end;
		else if (e.key === 'Escape') active = null;
		else return;
		e.preventDefault();
	}
	// a tap outside the chart puts a finger's readout away
	$effect(() => {
		if (active == null) return;
		const away = (e: PointerEvent) => {
			if (el && !el.contains(e.target as Node)) active = null;
		};
		window.addEventListener('pointerdown', away);
		return () => window.removeEventListener('pointerdown', away);
	});
	// another series (a different parameter or range): start over
	$effect(() => {
		void points;
		active = null;
	});
</script>

<div
	class="chart"
	class:fit
	bind:this={el}
	bind:clientWidth={width}
	bind:clientHeight={measured}
	role="slider"
	tabindex={points.length ? 0 : -1}
	aria-label={label}
	aria-valuemin={points.length ? 1 : 0}
	aria-valuemax={points.length}
	aria-valuenow={points.length ? shown + 1 : 0}
	aria-valuetext={spoken(points[shown])}
	{onpointermove}
	{onpointerdown}
	{onpointerleave}
	{onkeydown}
>
	<svg {width} height={h} viewBox="0 0 {width} {h}" aria-hidden="true">
		{#if title}
			<text class="axis-title" transform="translate(11 {TOP + plotH / 2}) rotate(-90)" text-anchor="middle">{title}</text>
		{/if}
		{#each ticks as t (t)}
			<line x1={LEFT} x2={width} y1={y(t)} y2={y(t)} class="grid"></line>
			<text x={LEFT - 6} y={y(t) + 4} class="axis" text-anchor="end">{tickText(t)}</text>
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
		{#if hot}<line x1={x(hot.t)} x2={x(hot.t)} y1={TOP} y2={h - BOTTOM} class="guide"></line>{/if}
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
		{#if hot}<circle cx={x(hot.t)} cy={y(hot.v)} r="5.5" class="hot"></circle>{/if}
		<line x1={LEFT} x2={width} y1={h - BOTTOM} y2={h - BOTTOM} stroke="var(--border)"></line>
		{#each xTicks as t, i (i)}
			<text
				x={i === 0 ? LEFT : i === xTicks.length - 1 ? width : x(t)}
				y={h - 5}
				class="axis"
				text-anchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
				>{i === xTicks.length - 1 && isToday(t) ? 'Today' : fmt(t)}</text
			>
		{/each}
	</svg>
	{#if hot}
		{@const s = status(hot)}
		<!-- above the reading, or under it near the top; inside the chart's width -->
		<div class="readout" style:left="{Math.min(Math.max(x(hot.t) - 80, 0), Math.max(0, width - 160))}px" style:top="{y(hot.v) > 70 ? y(hot.v) - 64 : y(hot.v) + 14}px" aria-hidden="true">
			<div class="r-when">{when(hot.t)}</div>
			<div class="r-value">
				<span class="num">{value(hot)}</span>
				{#if s}<span class="status-{s.level}">{s.text}</span>{/if}
			</div>
		</div>
	{/if}
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
		/* a finger drags along the line; the page still scrolls up and down */
		touch-action: pan-y;
		-webkit-tap-highlight-color: transparent;
	}
	.chart.fit {
		height: 100%;
	}
	.chart:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 4px;
		border-radius: 8px;
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
		font-weight: 600;
	}
	/* the reading being read out */
	.guide {
		stroke: var(--text-muted);
		stroke-opacity: 0.5;
	}
	.hot {
		fill: var(--bg);
		stroke: var(--accent);
		stroke-width: 2.5;
	}
	.readout {
		position: absolute;
		z-index: 3;
		width: max-content;
		max-width: 200px;
		padding: 8px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-radius: 12px;
		background: var(--bg);
		border: 1px solid var(--border-strong);
		box-shadow: var(--shadow-toast);
		pointer-events: none;
	}
	.r-when {
		font-size: 12px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.r-value {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
	}
	.r-value span:last-child:not(.num) {
		font-size: 13px;
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
