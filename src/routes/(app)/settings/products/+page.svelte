<script lang="ts">
	// Saved products: a link for each thing the keeper buys again, one tap to
	// reorder. Dosing a saved product shows the same Reorder link.
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { fmtDateLong } from '$lib/time';
	let { data, form } = $props();

	// the product whose form is open: after a refused save, from ?edit= without scripts, or picked here
	let editing = $state<string | null>(untrack(() => form?.edit?.id ?? data.edit ?? null));
	const addErr = $derived<Record<string, string>>(form?.add?.errors ?? {});
	const addVal = $derived(form?.add?.values ?? { name: data.prefill, url: '', note: '' });
	const editErr = $derived<Record<string, string>>(form?.edit?.errors ?? {});
</script>

<svelte:head><title>Products · Settings · Waterline</title></svelte:head>

{#snippet fields(prefix: string, v: { name: string; url: string; note: string | null }, err: Record<string, string>)}
	<div class="field">
		<label class="label" for="{prefix}-name">Name</label>
		<input class="input" id="{prefix}-name" name="name" maxlength="80" value={v.name} list="dosed" autocomplete="off" placeholder="e.g. Water conditioner" aria-invalid={!!err.name} />
		{#if err.name}<span class="error-text">✕ {err.name}</span>{/if}
	</div>
	<div class="field">
		<label class="label" for="{prefix}-url">Link</label>
		<input
			class="input"
			id="{prefix}-url"
			name="url"
			inputmode="url"
			autocapitalize="off"
			autocomplete="off"
			spellcheck="false"
			value={v.url}
			placeholder="Paste the product page's address"
			aria-invalid={!!err.url}
		/>
		{#if err.url}<span class="error-text">✕ {err.url}</span>{/if}
	</div>
	<div class="field">
		<label class="label" for="{prefix}-note">Note · optional</label>
		<input class="input" id="{prefix}-note" name="note" maxlength="120" value={v.note ?? ''} autocomplete="off" placeholder="Size, price, which one" />
	</div>
{/snippet}

<div class="page sub-page">
	<div class="head">
		<a class="back sub-back" href="/settings">‹ Settings</a>
		<h1>Products</h1>
		<p class="muted">Links to what you buy again, like conditioner, fertilizer, food or filter media. Dosing a saved product shows its Reorder link.</p>
	</div>

	{#if data.products.length}
		<ul class="list">
			{#each data.products as p (p.id)}
				<li>
					<div class="item">
						<div class="t">
							<span class="name">{p.name}</span>
							<span class="meta">{p.host}{p.note ? ` · ${p.note}` : ''}</span>
							{#if p.dosed}<span class="meta">Last dosed {fmtDateLong(p.dosed.date)} in {p.dosed.tank}</span>{/if}
						</div>
						<div class="acts">
							<a
								class="btn-text edit-link"
								href="?edit={p.id}"
								aria-expanded={editing === p.id}
								onclick={(e) => {
									e.preventDefault();
									editing = editing === p.id ? null : p.id;
								}}>Edit<span class="sr-only"> {p.name}</span></a
							>
							<a class="btn reorder" href={p.url} target="_blank" rel="noopener noreferrer"
								>Reorder<span aria-hidden="true"> ↗</span><span class="sr-only"> {p.name}, opens {p.host} in a new tab</span></a
							>
						</div>
					</div>
					{#if editing === p.id}
						<form
							method="POST"
							action="?/update"
							class="edit"
							use:enhance={() =>
								async ({ result, update }) => {
									// saved or deleted: back to the list
									if (result.type === 'redirect') editing = null;
									await update();
								}}
						>
							<input type="hidden" name="id" value={p.id} />
							{@render fields(`e-${p.id}`, form?.edit?.id === p.id ? form.edit.values : p, form?.edit?.id === p.id ? editErr : {})}
							<div class="edit-acts">
								<button class="btn del" formaction="?/delete">Delete</button>
								<a class="btn" href="/settings/products" onclick={(e) => (e.preventDefault(), (editing = null))}>Cancel</a>
								<button class="btn btn-primary">Save</button>
							</div>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<EmptyState compact icon="dosing" title="No products yet" text="Save a link for each thing you buy again, and reordering is one tap." />
	{/if}

	<form method="POST" action="?/add" class="add" id="add" use:enhance>
		<h2>Add a product</h2>
		{@render fields('add', addVal, addErr)}
		<datalist id="dosed">{#each data.suggestions as s (s)}<option value={s}></option>{/each}</datalist>
		<button class="btn btn-primary go">Add product</button>
	</form>
</div>

<style>
	.page {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 600px;
	}
	.head {
		display: flex;
		flex-direction: column;
	}
	h1 {
		margin: 0 0 4px;
		font-size: 28px;
		font-weight: 600;
	}
	.head p {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
	}

	/* the list: one card, a row per product */
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.list li + li {
		border-top: 1px solid var(--border);
	}
	.item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 12px 12px 16px;
	}
	.t {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: 16px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.meta {
		font-size: 13px;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.acts {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.edit-link {
		color: var(--text-muted);
		font-weight: 600;
	}
	.reorder {
		min-height: 40px;
		padding: 0 14px;
		border-radius: 10px;
		font-size: 14px;
	}
	.edit {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 4px 16px 16px;
	}
	.edit-acts {
		display: flex;
		gap: 10px;
	}
	.edit-acts .btn-primary {
		flex: 1;
	}
	.del {
		margin-right: auto;
		color: var(--bad);
		border-color: var(--bad-border);
	}

	/* adding: the same fields, always open */
	.add {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 16px;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	.add :global(.input),
	.edit :global(.input) {
		background: var(--surface-2);
		border-color: var(--border-strong);
	}
	.go {
		min-height: 48px;
	}

	@media (hover: hover) {
		.edit-link:hover {
			color: var(--accent);
		}
		.del:hover {
			background: var(--bad-bg);
		}
	}
	@media (min-width: 1024px) {
		.page {
			gap: 22px;
		}
		.go {
			align-self: flex-start;
			min-height: 44px;
			padding: 0 22px;
		}
		/* Delete on the left, Cancel and Save at the end, as in the other desktop forms */
		.edit-acts .btn-primary {
			flex: none;
			padding: 0 22px;
		}
	}
</style>
