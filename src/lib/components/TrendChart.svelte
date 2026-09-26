<script lang="ts">
	// Trend chart: target band, reading line, event markers (tap to open), and the
	// latest point colored by status. Sized to its container so nothing distorts.
	import type { StatusLevel } from '$lib/status';

	interface Point {
		t: number; // ms
		v: number; // display units
	}
	interface Marker {
		t: number;
		label: string;
		href: string;
	}

	let {
		points,
		band,
		markers = [],
		from,
		to,
		lastLevel = 'ok',
		height = 132,
		label
	}: {
		points: Point[];
		band: { min: number | null; max: number | null };
		markers?: Marker[];
		from: number;
		to: number;
		lastLevel?: StatusLevel;
		height?: number;
		label: string;
	} = $props();

	let width = $state(320);
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
		return { lo: Math.max(lo >= 0 ? 0 : -Infinity, lo - pad), hi: hi + pad };
	});

	const x = (t: number) => 10 + ((t - from) / Math.max(1, to - from)) * (width - 20);
	const y = (v: number) => TOP + (1 - (v - domain.lo) / (domain.hi - domain.lo)) * (height - TOP - BOTTOM);

	const line = $derived(points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '));
	const last = $derived(points.at(-1));
	const bandTop = $derived(band.max != null ? y(band.max) : TOP);
	const bandBottom = $derived(band.min != null ? y(band.min) : height - BOTTOM);
	const hasBand = $derived(band.min != null || band.max != null);

	const fmt = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
</script>

<div class="chart" bind:clientWidth={width}>
	<svg {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={label}>
		{#if hasBand}
			<rect x="0" y={bandTop} width={width} height={Math.max(0, bandBottom - bandTop)} fill="var(--band)"></rect>
			{#if band.max != null}
				<line x1="0" x2={width} y1={bandTop} y2={bandTop} class="band-edge"></line>
			{/if}
			{#if band.min != null}
				<line x1="0" x2={width} y1={bandBottom} y2={bandBottom} class="band-edge"></line>
			{/if}
		{/if}
		{#each markers as m (m.href)}
			<line x1={x(m.t)} x2={x(m.t)} y1={TOP - 10} y2={height - BOTTOM} class="marker-line"></line>
		{/each}
		<polyline points={line} fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"
		></polyline>
		{#if last}
			<circle
				cx={x(last.t)}
				cy={y(last.v)}
				r="4.5"
				fill={lastLevel === 'bad' ? 'var(--bad)' : lastLevel === 'warn' ? 'var(--warn)' : 'var(--accent)'}
			></circle>
		{/if}
		<line x1="0" x2={width} y1={height - BOTTOM} y2={height - BOTTOM} stroke="var(--border)"></line>
		<text x="0" y={height - 4} class="axis">{fmt(from)}</text>
		<text x={width} y={height - 4} class="axis" text-anchor="end">Today</text>
	</svg>
	{#each markers as m (m.href)}
		<a
			class="marker"
			href={m.href}
			style:left="{x(m.t)}px"
			style:top="{TOP - 10}px"
			title={m.label}
			aria-label="{m.label}, {fmt(m.t)}"
		></a>
	{/each}
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
	.axis {
		fill: var(--text-faint);
		font-size: 11px;
	}
	.marker {
		position: absolute;
		width: 14px;
		height: 14px;
		margin: -7px 0 0 -7px;
		border-radius: 50%;
		background: var(--border);
		border: 1px solid var(--text-muted);
	}
	.marker::before {
		/* bigger tap target */
		content: '';
		position: absolute;
		inset: -15px;
	}
	.marker:hover,
	.marker:focus-visible {
		background: var(--accent);
	}
</style>
