<script lang="ts">
	// Bulk import: words the file uses that Waterline doesn't know ("New" for a
	// plant's status). Choose what each means once, and every row with it is
	// read that way; the file is checked again. A plain form, so it works
	// without scripts (Check again). The columns picked stay as they are.
	import { enhance } from '$app/forms';

	interface Word {
		key: string;
		label: string;
		word: string;
		norm: string;
		rows: number;
		options: { value: string; label: string }[];
		chosen: string | null;
	}
	let {
		file,
		csv,
		fileColumns,
		words
	}: {
		file: string;
		csv: string;
		fileColumns: { index: number; key: string | null }[];
		words: Word[];
	} = $props();

	let busy = $state(false);
	const left = $derived(words.filter((w) => !w.chosen).length);
</script>

<section class="card words" aria-labelledby="words-h">
	<div class="head">
		<h2 id="words-h">Words to check</h2>
		<span class="s">{left ? `${left} to choose` : '✓ All chosen'}</span>
	</div>
	<p class="hint">Your file uses {words.length === 1 ? 'a word' : 'words'} Waterline doesn't know. Choose what each means, and every row with it is fixed.</p>
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
		{#each fileColumns as c (c.index)}<input type="hidden" name="map.{c.index}" value={c.key ?? ''} />{/each}
		<ul>
			{#each words as w (w.key + w.norm)}
				<li>
					<label for="word-{w.key}-{w.norm}" class="w">
						<span class="wt">{w.label}: “{w.word}”</span>
						<span class="wr">{w.rows} row{w.rows === 1 ? '' : 's'}</span>
					</label>
					<select
						id="word-{w.key}-{w.norm}"
						class="input"
						name="word.{w.key}.{w.norm}"
						value={w.chosen ?? ''}
						disabled={busy}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					>
						<option value="" disabled={!!w.chosen}>Choose…</option>
						{#each w.options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
					</select>
				</li>
			{/each}
		</ul>
		<noscript><button class="btn">Check again</button></noscript>
	</form>
</section>

<style>
	.words {
		padding: 14px 16px;
		margin-bottom: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		border-color: var(--warn-border, var(--border-strong));
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}
	.s {
		font-size: 13px;
		color: var(--text-muted);
	}
	.hint {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	ul {
		margin: 4px 0 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	li {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.w {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.wt {
		font-size: 14px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.wr {
		font-size: 12px;
		color: var(--text-muted);
	}
	select {
		width: 170px;
		flex-shrink: 0;
		height: 44px;
	}
</style>
