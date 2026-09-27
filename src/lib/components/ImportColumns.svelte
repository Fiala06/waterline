<script lang="ts">
	// Bulk import: the file's columns, each with what it's read as. Waterline
	// matches them by name; any can be picked by hand ("Nitrat" is Nitrate),
	// or left out. Picking one checks the file again. A plain form, so it
	// works without scripts (Check again).
	import { enhance } from '$app/forms';

	let {
		file,
		csv,
		fileColumns,
		columns,
		open = false
	}: {
		file: string;
		csv: string;
		fileColumns: { index: number; header: string; key: string | null }[];
		columns: { key: string; header: string }[];
		/** open when something wasn't matched */
		open?: boolean;
	} = $props();

	let busy = $state(false);
	const unread = $derived(fileColumns.filter((c) => !c.key).length);
</script>

<details class="card cols" {open}>
	<summary>
		<span class="t">Columns</span>
		<span class="s">{unread ? `${unread} not read` : `All ${fileColumns.length} read`}</span>
	</summary>
	<form
		method="POST"
		action="?/check"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<input type="hidden" name="csv" value={csv} />
		<input type="hidden" name="fileName" value={file} />
		<p class="hint">Waterline matched these by name. Pick what any other column is, or leave it out.</p>
		<ul>
			{#each fileColumns as c (c.index)}
				<li>
					<label for="map-{c.index}" class="fc">{c.header}</label>
					<select
						id="map-{c.index}"
						class="input"
						name="map.{c.index}"
						value={c.key ?? ''}
						disabled={busy}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					>
						<option value="">Not read</option>
						{#each columns as o (o.key)}<option value={o.key}>{o.header}</option>{/each}
					</select>
				</li>
			{/each}
		</ul>
		<noscript><button class="btn">Check again</button></noscript>
	</form>
</details>

<style>
	.cols {
		padding: 0;
		margin-bottom: 16px;
	}
	summary {
		list-style: none;
		min-height: 52px;
		padding: 0 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary::after {
		content: '›';
		color: var(--text-muted);
		transition: transform 0.15s;
	}
	details[open] summary::after {
		transform: rotate(90deg);
	}
	.t {
		font-weight: 600;
	}
	.s {
		margin-left: auto;
		font-size: 14px;
		color: var(--text-muted);
	}
	form {
		padding: 0 16px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	li {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
		align-items: center;
		gap: 10px;
	}
	.fc {
		font-size: 15px;
		overflow-wrap: anywhere;
	}
	.fc::after {
		content: ' →';
		color: var(--text-faint);
	}
	select {
		width: 100%;
		min-height: 44px;
	}
	@media (prefers-reduced-motion: reduce) {
		summary::after {
			transition: none;
		}
	}
</style>
