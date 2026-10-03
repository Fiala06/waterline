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
		<div class="title-row">
			<h1>Products</h1>
			<a class="btn btn-primary" href="#add">+ Add product</a>
		</div>
		<p class="lede">Links to what you buy again, like conditioner, fertilizer, food or filter media. Dosing a saved product shows its Reorder link.</p>
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
							{#if data.currentTankId}
								<a class="btn-text log-link" href="/tanks/{data.currentTankId}/spending/new?product={p.id}"
									>Log a purchase<span class="sr-only"> of {p.name}</span></a
								>
							{/if}
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
								<button class="btn btn-danger del" formaction="?/delete">Delete</button>
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

	<form
		method="POST"
		action="?/add"
		class="add"
		id="add"
		use:enhance={({ formElement }) =>
			async ({ result, update }) => {
				await update();
				// saved: empty the fields for the next one (the page stays, so they'd keep what was typed)
				if (result.type === 'redirect') {
					for (const el of formElement.querySelectorAll('input')) el.value = '';
				}
			}}
	>
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
		max-width: 820px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
	}
	.lede {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		max-width: 620px;
	}

	/* the list: a 2px ink rule, then a row per product */
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 2px solid var(--ink);
	}
	.list li {
		border-bottom: 1px solid var(--divider);
	}
	.item {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 12px;
		padding: 10px 0;
	}
	.t {
		flex: 1;
		min-width: 200px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: 15px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.meta {
		font-size: 12px;
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
	}
	.edit {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 4px 0 16px;
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
	}

	/* adding: the same fields, under a rule of their own */
	.add {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding-top: 14px;
		border-top: 2px solid var(--ink);
		scroll-margin-top: 16px;
	}
	h2 {
		margin: 0;
		font-size: 17px;
	}
	.go {
		min-height: 48px;
	}

	@media (hover: hover) {
		.edit-link:hover {
			color: var(--accent-text);
		}
	}
	@media (min-width: 1024px) {
		.page {
			gap: 22px;
		}
		h1 {
			font-size: 22px;
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
