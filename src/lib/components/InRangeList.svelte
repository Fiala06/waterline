<script lang="ts">
	import type { StatusLevel } from '$lib/status';
	// Overview › Tank parameters (redesign README → Screens §2, "In range"):
	// every tested parameter's latest reading as a 4-column grid under a 2px ink
	// rule (3 columns when narrow, 2 on phones), each opening its chart. The ones
	// in Needs attention stay here too, with their status (#75); the header counts
	// those in range ("✓ 8 of 11 in range"); then a line for those never tested.
	interface Item {
		id: string;
		label: string;
		fullName: string;
		value: string | null;
		/** "ppm", "°F"; empty for pH */
		unit: string;
		/** days since the reading, when it's older than its Test every cadence */
		due?: number | null;
		/** a sensor's latest reading (#19) */
		live?: string | null;
		level: StatusLevel;
		/** "✓ OK", "▲ Near low", "✕ High", "▲ Cycling" */
		statusText: string;
	}
	let {
		items,
		untested,
		total,
		streak = null,
		due = [],
		testHref = '/entries/test/new'
	}: {
		items: Item[];
		untested: string[];
		total: number;
		/** "Ammonia and nitrite at 0 for 6 tests. The bacteria are clocking in." */
		streak?: string | null;
		/** "Due a test: KH (23 days), GH (40 days)", any status */
		due?: { name: string; days: number }[];
		testHref?: string;
	} = $props();
	const okCount = $derived(items.filter((c) => c.level === 'ok').length);
</script>

<section class="in-range" aria-labelledby="in-range-h">
	<div class="section-head">
		<h2 id="in-range-h">Tank parameters</h2>
		<span class="count">
			{#if total === 0}
				<span class="meta">No readings yet</span>
			{:else}
				<span class="status-ok">{okCount === total ? `✓ All ${total} in range` : `✓ ${okCount} of ${total} in range`}</span>
				<span class="dot" aria-hidden="true">·</span><a href="/charts">Charts</a>
			{/if}
		</span>
	</div>
	{#if items.length}
		<ul class="grid">
			{#each items as c (c.id)}
				<li>
					<a href="/charts?p={c.id}" title="{c.fullName} · {c.statusText}{c.due != null ? ` · ▲ due a test, ${c.due} days ago` : ''}">
						<span class="k"
							>{#if c.level === 'ok'}<span class="ok status-ok" aria-hidden="true">✓</span>{c.label}{:else}{c.label}
								<span class="st status-{c.level}">{c.statusText}</span>{/if}</span
						>
						<span class="v" class:off={c.level === 'bad'}>{c.value}{#if c.unit}<span class="u">{c.unit}</span>{/if}</span>
						{#if c.due != null}<span class="due"><span class="status-warn" aria-hidden="true">▲</span> – {c.due} days ago · due</span>{/if}
						{#if c.live}<span class="due live">● {c.live}</span>{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
	{#if streak}<p class="streak"><span class="bug" aria-hidden="true">🦠</span>{streak}</p>{/if}
	{#if due.length}
		<p class="due-line">
			<a href={testHref}><span class="status-warn" aria-hidden="true">▲</span> Due a test: {due.map((d) => `${d.name} (${d.days} days)`).join(', ')}</a>
		</p>
	{/if}
	{#if untested.length}<p class="untested">Not tested: {untested.join(', ')}</p>{/if}
</section>

<style>
	.in-range {
		display: flex;
		flex-direction: column;
	}
	.count {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-size: 13px;
		font-weight: 700;
		white-space: nowrap;
	}
	.count .meta {
		font-weight: 400;
	}
	.count a {
		font-size: 13px;
	}
	.dot {
		color: var(--text-muted);
	}
	/* plain readings, the name over the value, a 1px divider under each row */
	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	li {
		min-width: 0;
	}
	.grid a {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: 52px;
		padding: 8px 12px 8px 0;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	.k {
		font-size: 12px;
		color: var(--text-muted);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ok {
		margin-right: 4px;
	}
	/* out of range or near a limit: the status word beside the name, as in Needs attention */
	.st {
		margin-left: 4px;
		font-weight: 800;
	}
	.v.off {
		color: var(--accent-text);
	}
	.v {
		font-size: 19px;
		font-weight: 800;
		white-space: nowrap;
	}
	.u {
		margin-left: 2px;
		font-size: 10px;
		font-weight: 400;
		color: var(--text-muted);
	}
	@media (hover: hover) {
		.grid a:hover {
			background: var(--surface);
			color: var(--text);
		}
	}
	.bug {
		margin-right: 6px;
	}
	.streak {
		margin: 12px 0 0;
		font-size: 14px;
		color: var(--text-2);
	}
	.untested {
		margin: 12px 0 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	.due {
		font-size: 11px;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.due-line {
		margin: 12px 0 0;
		font-size: 13px;
	}
	.due-line a {
		color: var(--text-2);
		font-weight: 600;
	}
	.due-line a:hover {
		color: var(--accent-text);
	}
	@media (min-width: 480px) {
		.grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@media (min-width: 1024px) {
		.grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.grid a {
			padding: 10px 12px 10px 0;
		}
		.k {
			font-size: 13px;
		}
		.v {
			font-size: 22px;
		}
		.u {
			margin-left: 3px;
			font-size: 12px;
		}
	}
	/* one column below ~1100px: four across, as on the full layout */
	@media (min-width: 1024px) and (max-width: 1099px), (min-width: 1200px) {
		.grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
</style>
