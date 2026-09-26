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
	// `full` adds y-axis ticks, more x labels and a popover for the chosen marker.
	import type { Snippet } from 'svelte';
	import type { StatusLevel } from '$lib/status';

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
		popover
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
	} = $props();

	let width = $state(320);
	const TOP = 22; // room for marker dots
	const BOTTOM = 20;
	const LEFT = $derived(full ? 34 : 10);

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

	/** Round tick values across the domain. */
	const ticks = $derived.by(() => {
		if (!full) return [];
		const span = domain.hi - domain.lo;
		const raw = span / 4;
		const mag = 10 ** Math.floor(Math.log10(raw));
		const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
		const out: number[] = [];
		for (let v = Math.ceil(domain.lo / step) * step; v <= domain.hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
		return out;
	});

	const xTicks = $derived.by(() => {
		const n = full ? Math.max(2, Math.min(5, Math.floor(width / 110))) : 2;
		return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
	});

	const x = (t: number) => LEFT + ((t - from) / Math.max(1, to - from)) * (width - LEFT - 10);
	const y = (v: number) => TOP + (1 - (v - domain.lo) / (domain.hi - domain.lo)) * (height - TOP - BOTTOM);

	const line = $derived(points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '));
	const last = $derived(points.at(-1));
	const bandTop = $derived(band.max != null ? y(band.max) : TOP);
	const bandBottom = $derived(band.min != null ? y(band.min) : height - BOTTOM);
	const hasBand = $derived(band.min != null || band.max != null);

	const fmt = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	const isToday = (t: number) => Math.abs(t - Date.now()) < 43_200_000;
	const chosen = $derived(markers.find((m) => m.href === selected) ?? null);
</script>

<div class="chart" bind:clientWidth={width}>
	<svg {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={label}>
		{#each ticks as t (t)}
			<line x1={LEFT} x2={width} y1={y(t)} y2={y(t)} class="grid"></line>
			<text x={LEFT - 6} y={y(t) + 4} class="axis" text-anchor="end">{t}</text>
		{/each}
		{#if hasBand}
			<rect x={LEFT} y={bandTop} width={width - LEFT} height={Math.max(0, bandBottom - bandTop)} fill="var(--band)"></rect>
			{#if band.max != null}<line x1={LEFT} x2={width} y1={bandTop} y2={bandTop} class="band-edge"></line>{/if}
			{#if band.min != null}<line x1={LEFT} x2={width} y1={bandBottom} y2={bandBottom} class="band-edge"></line>{/if}
		{/if}
		{#each markers as m (m.href)}
			<line
				x1={x(m.t)}
				x2={x(m.t)}
				y1={TOP - 10}
				y2={height - BOTTOM}
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
		<line x1={LEFT} x2={width} y1={height - BOTTOM} y2={height - BOTTOM} stroke="var(--border)"></line>
		{#each xTicks as t, i (i)}
			<text
				x={i === 0 ? LEFT : i === xTicks.length - 1 ? width : x(t)}
				y={height - 4}
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
		font-size: 11px;
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
	.marker::after {
		content: '';
		position: absolute;
		inset: -12px; /* easier to tap than the 14px dot */
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
