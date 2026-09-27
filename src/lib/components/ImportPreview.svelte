<script lang="ts">
	// Bulk import, step 2: every row of the file before anything is added. Rows
	// that are fine are ticked; rows the tank already has wait for a tick; rows
	// with a problem and the template's own examples are listed but can't be.
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';

	interface Row {
		line: number;
		title: string;
		sub: string | null;
		detail: string;
		problems: string[];
		value: unknown;
		example: boolean;
		existing: string | null;
		reminder: string | null;
	}
	let {
		list,
		file,
		rows,
		ignored
	}: { list: 'livestock' | 'plants' | 'equipment'; file: string; rows: Row[]; ignored: string[] } = $props();

	const usable = (r: Row) => !!r.value && !r.example;
	let on = $state(untrack(() => rows.map((r) => usable(r) && !r.existing)));
	let busy = $state(false);

	const ready = $derived(rows.filter((r) => usable(r) && !r.existing).length);
	const existing = $derived(rows.filter((r) => usable(r) && r.existing).length);
	const bad = $derived(rows.filter((r) => !r.value).length);
	const examples = $derived(rows.filter((r) => r.example).length);

	const ticked = $derived(rows.filter((_, i) => on[i]));
	const animals = $derived(ticked.reduce((s, r) => s + ((r.value as { count?: number }).count ?? 0), 0));
	const reminders = $derived(ticked.filter((r) => r.reminder).length);
	const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
	const label = $derived(
		!ticked.length
			? 'Tick rows to add'
			: `Add ${list === 'livestock' ? plural(animals, 'animal') : list === 'plants' ? plural(ticked.length, 'plant') : plural(ticked.length, 'item')}`
	);
</script>

<form
	method="POST"
	action="?/import"
	class="preview"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update();
			busy = false;
		};
	}}
>
	<div class="summary">
		<p class="file">{file} · {plural(rows.length, 'row')}</p>
		<div class="tags">
			{#if ready}<span class="status-tag tag-ok sm">✓ {ready} to add</span>{/if}
			{#if existing}<span class="status-tag tag-warn sm">▲ {existing} already in the tank</span>{/if}
			{#if bad}<span class="status-tag tag-bad sm">✕ {bad} to fix</span>{/if}
			{#if examples}<span class="status-tag tag-none sm">– {plural(examples, 'example')} left out</span>{/if}
		</div>
		{#if ignored.length}<p class="ignored">Columns not read: {ignored.join(', ')}</p>{/if}
	</div>

	<ul class="rows">
		{#each rows as r, i (r.line)}
			<li>
				{#if usable(r)}
					<label class="row check-row">
						<input type="checkbox" name="row" value={JSON.stringify(r.value)} bind:checked={on[i]} />
						<span class="t">
							<span class="name">{r.title}</span>
							{#if r.sub}<span class="sci">{r.sub}</span>{/if}
							<span class="detail">{r.detail}</span>
							{#if r.existing}<span class="note status-warn">▲ {r.existing}</span>{/if}
						</span>
					</label>
				{:else}
					<div class="row off">
						<span class="mark" class:status-bad={!r.example} aria-hidden="true">{r.example ? '–' : '✕'}</span>
						<span class="t">
							<span class="name">{r.title}</span>
							<span class="detail">Row {r.line}</span>
							<!-- the mark beside it is the icon: ✕ or – -->
							{#if r.example}
								<span class="note">The template's example, left out</span>
							{:else}
								{#each r.problems as p (p)}<span class="note status-bad">{p}</span>{/each}
							{/if}
						</span>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
	{#if bad}<p class="hint">Fix those rows in your spreadsheet and choose the file again, or add the rest now.</p>{/if}

	{#if list === 'equipment' && rows.some((r) => usable(r) && r.reminder)}
		<label class="check-row reminders">
			<input type="checkbox" name="reminders" defaultChecked />
			<span>Also add the suggested maintenance reminders{reminders ? ` (${reminders})` : ''}</span>
		</label>
	{/if}

	<div class="foot">
		<a class="btn again" href="?">Choose another file</a>
		<button class="btn btn-primary go" disabled={!ticked.length || busy}>{label}</button>
	</div>
</form>

<style>
	.preview {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.summary {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.file {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.ignored,
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		border-radius: 14px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.rows li + li {
		border-top: 1px solid var(--divider-soft);
	}
	.row {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 14px;
	}
	.row input {
		margin-top: 1px;
	}
	.t {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.name {
		font-size: 15px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.sci {
		font-size: 13px;
		font-style: italic;
		color: var(--text-muted);
	}
	.detail {
		font-size: 13px;
		color: var(--text-muted);
	}
	.note {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-muted);
	}
	.off .name {
		color: var(--text-muted);
	}
	/* the checkbox's place: 24px, so every name lines up */
	.mark {
		width: 24px;
		flex-shrink: 0;
		text-align: center;
		font-weight: 700;
		color: var(--text-faint);
	}
	.reminders {
		font-size: 14px;
	}
	/* 05's sticky Save: the add button stays in reach on a long list */
	.foot {
		position: sticky;
		bottom: 0;
		z-index: 2;
		margin: 0 -20px;
		padding: 14px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		gap: 12px;
		background: var(--bg);
		border-top: 1px solid var(--divider-soft);
	}
	.again {
		flex-shrink: 0;
	}
	.go {
		flex: 1;
		min-height: 52px;
		border-radius: 14px;
		font-size: 16px;
	}

	@media (min-width: 1024px) {
		.rows {
			background: var(--surface-2);
		}
		.foot {
			position: static;
			margin: 6px 0 0;
			padding: 20px 0 0;
			border-top: 1px solid var(--border);
			background: none;
			justify-content: flex-end;
		}
		.foot .btn {
			min-height: 44px;
			border-radius: 12px;
			font-size: 15px;
		}
		.again {
			margin-right: auto;
		}
		.go {
			flex: none;
			padding: 0 22px;
		}
	}
</style>
