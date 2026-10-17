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
	import { goto } from '$app/navigation';
	import { paramStatus, statusShort } from '$lib/status';
	import { formatNumber } from '$lib/units';
	import { TARGET_BAND, targetPosition } from '$lib/charts';
	import { nearestIndex, type Marker } from './TrendChart.svelte';

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

	const x = (t: number) => LEFT + ((t - from) / Math.max(1, to - from)) * (width - LEFT - RIGHT);
	const y = (pos: number) => TOP + (1 - pos) * plotH;
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

	const xTicks = $derived.by(() => {
		const n = Math.max(2, Math.min(5, Math.floor((width - LEFT) / 90)));
		return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
	});
	const zones = $derived(
		[
			{ y: (TOP + bandTop) / 2, title: '✕ High', bad: true, room: bandTop - TOP },
			{ y: (bandTop + bandBottom) / 2, title: '✓ Target', bad: false, room: bandBottom - bandTop },
			{ y: (bandBottom + baseline) / 2, title: '✕ Low', bad: true, room: baseline - bandBottom }
		].filter((z) => z.room >= 14)
	);

	const fmt = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
	const dayOf = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone });
	const isToday = (t: number) => dayOf(t) === dayOf(Date.now());
	const when = (t: number) => {
		const d = new Date(t);
		const day = isToday(t) ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone });
		return `${day} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })}`;
	};
	const chosen = $derived(markers.find((m) => m.href === selected) ?? null);
	const tapWidth = $derived.by(() => {
		const xs = markers.map((m) => x(m.t));
		return xs.map((at, i) => Math.max(14, Math.min(44, ...xs.map((o, j) => (j === i ? 44 : Math.abs(o - at))))));
	});

	// The readout: every reading taken in the test nearest the pointer
	let active = $state<number | null>(null);
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

	const onMarker = (e: Event) => !!(e.target as Element | null)?.closest?.('.marker, .pop, .readout');
	let pointerType = 'mouse';
	function showAt(clientX: number) {
		if (!el || !times.length) return;
		active = nearestIndex(times.map(x), clientX - el.getBoundingClientRect().left);
	}
	function onpointermove(e: PointerEvent) {
		if (!onMarker(e) && (e.pointerType === 'mouse' || e.buttons)) showAt(e.clientX);
	}
	function onpointerdown(e: PointerEvent) {
		pointerType = e.pointerType;
		if (!onMarker(e)) showAt(e.clientX);
	}
	function onpointerleave(e: PointerEvent) {
		if (e.pointerType === 'mouse') active = null;
	}
	function onclick(e: MouseEvent) {
		if (onMarker(e) || pointerType !== 'mouse' || !hotHref) return;
		goto(hotHref);
	}
	function onkeydown(e: KeyboardEvent) {
		const end = times.length - 1;
		if (end < 0) return;
		if (e.key === 'ArrowRight' || e.key === 'ArrowUp') active = Math.min(end, (active ?? -1) + 1);
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') active = Math.max(0, (active ?? end + 1) - 1);
		else if (e.key === 'Home') active = 0;
		else if (e.key === 'End') active = end;
		else if (e.key === 'Escape') active = null;
		else if (e.key === 'Enter' && hotHref) goto(hotHref);
		else return;
		e.preventDefault();
	}
	$effect(() => {
		if (active == null) return;
		const away = (e: PointerEvent) => {
			if (el && !el.contains(e.target as Node)) active = null;
		};
		window.addEventListener('pointerdown', away);
		return () => window.removeEventListener('pointerdown', away);
	});
	// another range, or a parameter shown or hidden: start over
	$effect(() => {
		void times;
		active = null;
	});

	/** The readout beside the crosshair, on whichever side has room, and never past the chart's edges. */
	let tipW = $state(220);
	const tipLeft = (t: number) => {
		const px = x(t);
		const left = px + 14 + tipW <= width ? px + 14 : px - 14 - tipW;
		return Math.max(0, Math.min(left, width - tipW));
	};
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
		{onpointermove}
		{onpointerdown}
		{onpointerleave}
		{onclick}
		{onkeydown}
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
			{#each markers as m (m.href)}
				<line x1={x(m.t)} x2={x(m.t)} y1={TOP - 10} y2={baseline} class="marker-line" class:dosing={m.kind === 'dosing'} class:chosen={m.href === selected}></line>
			{/each}
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
			<line x1={LEFT} x2={width - RIGHT} y1={baseline} y2={baseline} class="baseline"></line>
			{#each xTicks as t, i (i)}
				<text
					x={i === 0 ? LEFT : i === xTicks.length - 1 ? width - RIGHT : x(t)}
					y={baseline + 16}
					class="axis"
					text-anchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
					>{i === xTicks.length - 1 && isToday(t) ? 'Today' : fmt(t)}</text
				>
			{/each}
			<text class="axis-title" x={LEFT + (width - LEFT - RIGHT) / 2} y={h - 4} text-anchor="middle">Date</text>
		</svg>
		{#if hotT != null && hot.length}
			<div class="readout" bind:offsetWidth={tipW} style:left="{tipLeft(hotT)}px" style:top="{TOP}px">
				<span class="r-kicker">{active === times.length - 1 ? 'Latest test' : 'Water test'}</span>
				<span class="r-when">{when(hotT)}</span>
				<ul>
					{#each [...hot].sort((a, b) => b.pos - a.pos) as r (r.id)}
						<li>
							<i class:dashed={r.dash} style:--key={r.color}></i><span class="r-name">{r.name}</span><span class="r-value num">{r.value}</span><span class="r-status status-{r.level}">{r.status}</span>
						</li>
					{/each}
				</ul>
				{#if hotHref}<a class="r-link" href={hotHref}>Open this test ›</a>{/if}
			</div>
		{/if}
	</div>
	{#each markers as m, i (m.href)}
		{#if onselect}
			<button
				type="button"
				class="marker"
				class:dosing={m.kind === 'dosing'}
				class:chosen={m.href === selected}
				style:left="{x(m.t)}px"
				style:top="{TOP - 10}px"
				style:--tap="{tapWidth[i]}px"
				aria-label="{m.label}, {fmt(m.t)}"
				aria-pressed={m.href === selected}
				onclick={() => onselect(m)}
			></button>
		{:else}
			<a class="marker" class:dosing={m.kind === 'dosing'} href={m.href} style:left="{x(m.t)}px" style:top="{TOP - 10}px" style:--tap="{tapWidth[i]}px" title={m.label} aria-label="{m.label}, {fmt(m.t)}"></a>
		{/if}
	{/each}
	{#if chosen && popover}
		<div class="pop" style:left="{Math.min(Math.max(x(chosen.t) - 90, 0), width - 200)}px" style:top="{TOP + 4}px">
			{@render popover(chosen)}
		</div>
	{/if}
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
	.baseline {
		stroke: var(--ink);
		stroke-width: 2;
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
	.axis {
		fill: var(--text-muted);
		font-size: 12px;
	}
	.axis-title {
		fill: var(--text-2);
		font-size: 12px;
		font-weight: 700;
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
		stroke: var(--ink);
		stroke-opacity: 1;
		stroke-dasharray: none;
		stroke-width: 1.5;
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
	.readout {
		position: absolute;
		z-index: 3;
		width: max-content;
		min-width: 200px;
		max-width: 280px;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--bg);
		border: 2px solid var(--ink);
		box-shadow: var(--shadow-md);
		pointer-events: none;
	}
	.r-kicker {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.r-when {
		font-size: 13px;
		font-weight: 800;
		padding-bottom: 4px;
	}
	.readout ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: 10px auto auto auto;
		column-gap: 8px;
		row-gap: 3px;
		font-size: 13px;
	}
	.readout li {
		display: contents;
	}
	.readout li i {
		align-self: center;
		width: 10px;
		height: 10px;
		background: var(--key);
	}
	.readout li i.dashed {
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
	.r-link {
		padding-top: 6px;
		font-size: 12px;
		font-weight: 700;
		color: var(--bad);
		pointer-events: auto;
	}
	.marker {
		position: absolute;
		z-index: 1;
		width: var(--tap, 44px);
		height: 44px;
		margin: -22px 0 0 calc(var(--tap, 44px) / -2);
		padding: 0;
		border: none;
		background: none;
	}
	.marker::before {
		content: '';
		position: absolute;
		top: 17px;
		left: calc(50% - 5px);
		width: 10px;
		height: 10px;
		box-sizing: border-box;
		background: var(--ink);
	}
	.marker.dosing::before {
		transform: rotate(45deg) scale(0.8);
		background: var(--neutral-600);
	}
	.marker:hover::before,
	.marker:focus-visible::before,
	.marker.chosen::before {
		background: var(--accent);
	}
	.marker:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -8px;
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
	.pop {
		position: absolute;
		width: 200px;
		z-index: 2;
		background: var(--bg);
		border: 2px solid var(--ink);
		padding: 10px 12px;
		box-shadow: var(--shadow-md);
	}
</style>
