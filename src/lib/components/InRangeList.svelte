<script lang="ts">
	// Dashboard refresh (1c): the readings that are fine, as a compact grid of
	// name and value (tap one for its chart), and a line for those never tested.
	// In a card like Needs attention's, each with its ✓, so it doesn't fade into
	// the page; quieter than the attention list, but easy to read. A small tile
	// each, the name over its value, so readings never run together.
	interface Item {
		id: string;
		label: string;
		fullName: string;
		value: string | null;
		/** "ppm", "°F"; empty for pH */
		unit: string;
	}
	let {
		items,
		untested,
		total,
		streak = null
	}: {
		items: Item[];
		untested: string[];
		total: number;
		/** "Ammonia and nitrite at 0 for 6 tests. The bacteria are clocking in." */
		streak?: string | null;
	} = $props();
</script>

<section class="in-range" aria-labelledby="in-range-h">
	<div class="head">
		<h2 id="in-range-h">In range</h2>
		<span class="count status-ok">{items.length === total ? `✓ All ${total} in range` : `✓ ${items.length} of ${total}`}</span>
	</div>
	{#if items.length}
		<ul class="grid">
			{#each items as c (c.id)}
				<li>
					<a href="/charts?p={c.id}" title="{c.fullName} · ✓ OK">
						<span class="k"><span class="ok status-ok" aria-hidden="true">✓</span>{c.label}</span>
						<span class="data v">{c.value}{#if c.unit}<span class="u">{c.unit.startsWith('°') ? c.unit : ` ${c.unit}`}</span>{/if}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
	{#if streak}<p class="streak"><span class="bug" aria-hidden="true">🦠</span>{streak}</p>{/if}
	{#if untested.length}<p class="untested">Not tested: {untested.join(', ')}</p>{/if}
</section>

<style>
	.in-range {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	.count {
		font-size: 13px;
		font-weight: 700;
	}
	/* a tile each, its name above its value, so they don't run together */
	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
		gap: 8px;
	}
	li {
		min-width: 0;
	}
	a {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: 44px;
		padding: 10px 12px 11px;
		border-radius: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
	}
	.k {
		font-size: 13px;
		color: var(--text-muted);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ok {
		margin-right: 5px;
		font-weight: 700;
	}
	.v {
		font-size: 20px;
		font-weight: 600;
		white-space: nowrap;
	}
	.u {
		margin-left: 2px;
		font-size: 12px;
		font-weight: 400;
		color: var(--text-muted);
	}
	@media (hover: hover) {
		a:hover {
			border-color: var(--accent);
		}
	}
	.bug {
		margin-right: 6px;
	}
	.streak {
		margin: 6px 0 0;
		font-size: 14px;
		color: var(--text-2);
	}
	.untested {
		margin: 6px 0 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	@media (min-width: 1024px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
		}
	}
</style>
