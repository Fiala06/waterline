<script lang="ts">
	// A feeding: by hand here, or logged by a feeding routine's Done (#17): the same food / amount / unit.
	import { untrack } from 'svelte';
	import { FEED_UNITS } from '$lib/tasks';
	import { valueOf, type FormValues } from '../event-form';

	let {
		mode,
		food = $bindable(),
		values,
		errors,
		recentFoods
	}: {
		mode: 'new' | 'edit';
		/** the food typed (the offline queue reads it) */
		food: string;
		values: FormValues;
		errors: Record<string, string>;
		/** foods fed before, by hand or by a routine */
		recentFoods: { food: string; amount: unknown; unit: unknown; at: string }[];
	} = $props();

	let feedUnit = $state(untrack(() => valueOf(values, 'unit') || (mode === 'new' ? 'pinches' : '')));
	function pickFood(r: (typeof recentFoods)[number]) {
		food = r.food;
		if (typeof r.unit === 'string' && r.unit) feedUnit = r.unit;
	}
</script>

<!-- by hand here, or logged by a feeding routine's Done (#17): the same food / amount / unit -->
<div class="dose">
	<div class="field product">
		<label class="label" for="food">Food</label>
		<input class="input" id="food" name="food" bind:value={food} list="recent-foods" maxlength="80" autocomplete="off" placeholder="e.g. Micro pellets" aria-invalid={!!errors.food} />
		<datalist id="recent-foods">
			{#each recentFoods as r (r.food)}<option value={r.food}></option>{/each}
		</datalist>
		{#if recentFoods.length && !food}
			<div class="chips">
				{#each recentFoods as r (r.food)}
					<button type="button" class="chip" onclick={() => pickFood(r)}>{r.food}</button>
				{/each}
			</div>
		{/if}
		{#if errors.food}<span class="error-text">✕ {errors.food}</span>{/if}
	</div>
	<div class="field">
		<label class="label" for="amount">Amount</label>
		<input class="input" id="amount" name="amount" inputmode="decimal" autocomplete="off" defaultValue={valueOf(values, 'amount')} placeholder="e.g. 2" aria-invalid={!!errors.amount} />
		{#if errors.amount}<span class="error-text">✕ {errors.amount}</span>{/if}
	</div>
	<div class="field">
		<label class="label" for="unit">Unit</label>
		<input class="input" id="unit" name="unit" bind:value={feedUnit} list="feed-units" maxlength="20" autocomplete="off" placeholder="pinches, cubes, mL, g" />
		<datalist id="feed-units">
			{#each FEED_UNITS as u (u)}<option value={u}></option>{/each}
			<option value="mL"></option>
			<option value="tablets"></option>
		</datalist>
	</div>
</div>

<style>
	/* ── Food, amount, unit (one row on desktop), as a dose's ── */
	.dose {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px 12px;
		align-items: start;
	}
	.product {
		grid-column: 1 / -1;
	}

	@media (min-width: 1024px) {
		.dose {
			grid-template-columns: minmax(0, 1fr) 120px 110px;
			gap: 12px;
		}
		.product {
			grid-column: auto;
		}
	}
</style>
