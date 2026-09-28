<script lang="ts">
	// Dashboard refresh (1c): the readings that are fine, as a compact grid of
	// name and value (tap one for its chart), and a line for those never tested.
	interface Item {
		id: string;
		label: string;
		fullName: string;
		value: string | null;
		/** only temperature keeps its unit here */
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
		<ul class="grid">
			{#each items as c, i (c.id)}
				<!-- the last row of each column has no line: 2 across on phones, 3 on desktop -->
				<li class:last2={i + 2 >= items.length} class:last3={i + 3 >= items.length}>
					<a href="/charts?p={c.id}" title={c.fullName}>
						<span class="k">{c.label}</span>
						<span class="data v">{c.value}{c.unit}</span>
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
		grid-template-columns: repeat(2, minmax(0, 1fr));
		column-gap: 24px;
	}
	li {
		border-bottom: 1px solid var(--divider-soft);
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
		color: var(--text-2);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
	@media (max-width: 1023px) {
		li.last2 {
			border-bottom: none;
		}
	}
	@media (min-width: 1024px) {
		.grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			column-gap: 28px;
		}
		li.last3 {
			border-bottom: none;
		}
	}
</style>
