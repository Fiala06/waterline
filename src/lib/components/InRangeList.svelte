<script lang="ts">
	// Dashboard refresh (1c): the readings that are fine, as a compact grid of
	// name and value (tap one for its chart), and a line for those never tested.
	// In a card like Needs attention's, each with its ✓, so it doesn't fade into
	// the page; quieter than the attention list, but easy to read. Columns are
	// narrow whatever the width, so a value stays beside its name.
	interface Item {
		id: string;
		label: string;
		fullName: string;
		value: string | null;
		/** "ppm", "°F"; empty for pH */
		unit: string;
	}
	let { items, untested, total }: { items: Item[]; untested: string[]; total: number } = $props();
</script>

<section class="in-range" aria-labelledby="in-range-h">
	<div class="head">
		<h2 id="in-range-h">In range</h2>
		<span class="count status-ok">{items.length === total ? `✓ All ${total} in range` : `✓ ${items.length} of ${total}`}</span>
	</div>
	{#if items.length}
		<ul class="card grid">
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
	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		/* as many narrow columns as fit (2 on a phone), filled from the left */
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		column-gap: 24px;
		padding: 2px 16px;
	}
	li {
		min-width: 0;
	}
	a {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
		min-height: 44px;
		padding: 10px 0;
		font-size: 15px;
		color: var(--text);
	}
	.k {
		color: var(--text);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ok {
		margin-right: 7px;
		font-size: 13px;
		font-weight: 700;
	}
	.v {
		font-weight: 600;
		white-space: nowrap;
	}
	.u {
		margin-left: 1px;
		font-size: 12px;
		font-weight: 400;
		color: var(--text-muted);
	}
	@media (hover: hover) {
		a:hover .k {
			color: var(--accent);
		}
	}
	.untested {
		margin: 6px 0 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	@media (min-width: 1024px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
			column-gap: 32px;
		}
	}
</style>
