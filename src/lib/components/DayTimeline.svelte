<script lang="ts">
	// A day on one line per item (#25): the hours it runs as ink bars on a 24-hour
	// track, lights' ramps as lighter ends, and a red mark at the time now.
	import type { Schedule } from '$lib/equipment';

	let {
		rows,
		now = null,
		compact = false
	}: {
		rows: { label: string; schedule: Schedule; kind?: string }[];
		/** "HH:MM" in the keeper's time zone; null draws no mark */
		now?: string | null;
		compact?: boolean;
	} = $props();

	const W = 1440; // one unit a minute
	const mins = (s: string) => {
		const [h, m] = s.split(':').map(Number);
		return h * 60 + m;
	};
	// a period as one or two spans (across midnight it wraps)
	function spans(p: { on: string; off: string }) {
		const a = mins(p.on);
		const b = mins(p.off);
		return a <= b ? [[a, b]] : [[a, W], [0, b]];
	}
	const nowX = $derived(now ? mins(now) : null);
	const H = $derived(compact ? 10 : 14);
</script>

<div class="timeline" class:compact role="img" aria-label="When each item runs through the day">
	{#each rows as r (r.label)}
		<div class="row">
			<span class="lbl">{r.label}</span>
			<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
				<rect x="0" y="0" width={W} height={H} class="track" />
				{#each r.schedule.periods as p, i (i)}
					{#each spans(p) as [a, b], j (j)}
						<rect x={a} y="0" width={b - a} height={H} class="on" />
						{#if r.schedule.rampMin}
							<!-- the ramp up at the start and down at the end, lighter -->
							<rect x={a} y="0" width={Math.min(r.schedule.rampMin, b - a)} height={H} class="ramp" />
							<rect x={Math.max(a, b - r.schedule.rampMin)} y="0" width={Math.min(r.schedule.rampMin, b - a)} height={H} class="ramp" />
						{/if}
					{/each}
				{/each}
				{#if nowX != null}<rect x={nowX - 2} y="0" width="4" height={H} class="now" />{/if}
			</svg>
		</div>
	{/each}
	<div class="row ticks" aria-hidden="true">
		<span class="lbl"></span>
		<div class="hours">{#each [0, 6, 12, 18, 24] as h (h)}<span>{String(h).padStart(2, '0')}</span>{/each}</div>
	</div>
</div>

<style>
	.timeline {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-variant-numeric: tabular-nums;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(72px, 140px) minmax(0, 1fr);
		align-items: center;
		gap: 10px;
	}
	.compact .row {
		grid-template-columns: minmax(60px, 110px) minmax(0, 1fr);
	}
	.lbl {
		font-size: 13px;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.compact .lbl {
		font-size: 12px;
	}
	svg {
		display: block;
		width: 100%;
		height: 18px;
	}
	.compact svg {
		height: 12px;
	}
	.track {
		fill: var(--neutral-300);
	}
	.on {
		fill: var(--ink);
	}
	.ramp {
		fill: var(--neutral-600);
	}
	.now {
		fill: var(--accent);
	}
	.hours {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: var(--text-muted);
	}
</style>
