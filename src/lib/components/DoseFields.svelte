<script lang="ts">
	// G4 · Dosing: product, amount and unit, with what was dosed before and the reorder link.
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { DOSING_UNITS } from '$lib/events';
	import { doseHint as hintFor, lastDoseOf, productChoices as choicesOf, type RecentDose } from './event-form';

	let {
		mode,
		product = $bindable(''),
		amount = '',
		unit = '',
		errors = {},
		recentProducts = [],
		productLinks = [],
		timeZone
	}: {
		mode: 'new' | 'edit';
		product?: string;
		amount?: string;
		unit?: string;
		errors?: Record<string, string>;
		recentProducts?: RecentDose[];
		/** Saved products (Settings → Products): dosing one shows its Reorder link */
		productLinks?: { name: string; url: string }[];
		timeZone: string;
	} = $props();

	let dosingUnit = $state(untrack(() => unit || 'mL'));
	const lastDose = $derived(lastDoseOf(recentProducts, product));
	// what the Product field offers (#73): recently dosed first, then saved products not dosed yet
	const productChoices = $derived(choicesOf(recentProducts, productLinks));
	function pickProduct(name: string) {
		product = name;
		const r = recentProducts.find((x) => x.product === name);
		if (typeof r?.unit === 'string') dosingUnit = r.unit;
	}
	const savedLink = $derived(productLinks.find((l) => l.name.trim().toLowerCase() === product.trim().toLowerCase()));
	const doseHint = $derived(hintFor(recentProducts, product, productChoices.length, timeZone));
</script>

<div class="trio">
	<div class="field trio-wide">
		<label class="label" for="product">Product</label>
		<input
			class="input"
			id="product"
			name="product"
			bind:value={product}
			list="recent-products"
			maxlength="80"
			autocomplete="off"
			placeholder="e.g. All-in-one fertilizer"
			aria-invalid={!!errors.product}
		/>
		<datalist id="recent-products">
			{#each productChoices as name (name)}<option value={name}></option>{/each}
		</datalist>
		{#if productChoices.length && !product}
			<div class="chips">
				{#each productChoices.slice(0, 8) as name (name)}
					<button type="button" class="chip" onclick={() => pickProduct(name)}>{name}</button>
				{/each}
			</div>
		{/if}
		{#if errors.product}<span class="error-text">✕ {errors.product}</span>{/if}
	</div>
	<div class="field">
		<label class="label" for="amount">Amount</label>
		<input class="input" id="amount" name="amount" inputmode="decimal" autocomplete="off" defaultValue={amount} aria-invalid={!!errors.amount} />
		{#if errors.amount}<span class="error-text">✕ {errors.amount}</span>{/if}
	</div>
	<div class="field">
		<label class="label" for="unit">Unit</label>
		<select class="input" id="unit" name="unit" bind:value={dosingUnit}>
			{#each DOSING_UNITS as u (u)}<option value={u}>{u}</option>{/each}
		</select>
	</div>
</div>
{#if doseHint}<span class="hint">{doseHint}</span>{/if}
{#if mode === 'new'}<a class="hint calc-link" href="/calculators?tank={page.url.searchParams.get('tank') ?? ''}#dose">What does this dose add? Dose → ppm ›</a>{/if}
{#if mode === 'new'}<a class="hint calc-link" href="/settings/products">Manage products ›</a>{/if}
{#if mode === 'new' && savedLink}
	<a class="reorder" href={savedLink.url} target="_blank" rel="noopener noreferrer"
		>Reorder {savedLink.name}<span aria-hidden="true"> ↗</span><span class="sr-only"> (opens in a new tab)</span></a
	>
{:else if mode === 'new' && lastDose}
	<!-- a product dosed before is one worth a link -->
	<a class="reorder" href="/settings/products?name={encodeURIComponent(product.trim())}#add">Save a reorder link</a>
{/if}

<style>
	/* "Reorder Seachem Prime ↗" under the dosing fields */
	.reorder {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin: -12px 0 -8px;
		font-size: 14px;
		font-weight: 800;
	}
</style>
