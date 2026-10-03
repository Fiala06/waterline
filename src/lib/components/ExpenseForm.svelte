<script lang="ts">
	// Add / edit an expense (#7), with its receipt (#8): a photo or a PDF.
	import { enhance } from '$app/forms';
	import ConfirmDelete from './ConfirmDelete.svelte';
	import DateField from './DateField.svelte';
	import { untrack } from 'svelte';

	let {
		mode,
		values,
		errors = {},
		tanks,
		currencySymbol,
		today,
		cancelHref,
		receipt = null
	}: {
		mode: 'new' | 'edit';
		values: { amount: string; what: string; category: string; date: string; note: string; tankId: string; productId: string };
		errors?: Record<string, string>;
		tanks: { id: string; name: string }[];
		currencySymbol: string;
		today: string;
		cancelHref: string;
		/** the receipt it has: its address and what it is */
		receipt?: { href: string; type: 'image/jpeg' | 'application/pdf' } | null;
	} = $props();

	const CATEGORIES = [
		{ value: 'livestock', label: 'Livestock' },
		{ value: 'plants', label: 'Plants' },
		{ value: 'equipment', label: 'Equipment' },
		{ value: 'consumables', label: 'Consumables' },
		{ value: 'other', label: 'Other' }
	];
	let category = $state(untrack(() => values.category || 'consumables'));
	let date = $state(untrack(() => values.date || today));
	let busy = $state(false);
</script>

<form
	method="POST"
	action="?/save"
	class="xform"
	enctype="multipart/form-data"
	use:enhance={() => {
		busy = true;
		return async ({ update, formElement }) => {
			await update({ reset: false });
			busy = false;
			// a receipt is sent once: not again with the next save
			for (const el of formElement.querySelectorAll<HTMLInputElement>('input[name=receipt], input[name=removeReceipt]')) {
				el.value = el.type === 'file' ? '' : el.value;
				el.checked = false;
			}
		};
	}}
>
	<!-- phones; on desktop the header has the title -->
	<div class="bar hide-desk">
		<a class="cancel" href={cancelHref}>Cancel</a>
		<h1>{mode === 'edit' ? 'Edit expense' : 'Add expense'}</h1>
		<button class="save-top" disabled={busy}>Save</button>
	</div>

	<div class="body">
		<input type="hidden" name="productId" value={values.productId} />
		<div class="pair">
			<div class="field">
				<label class="label" for="x-amount">Amount</label>
				<div class="money" class:bad={!!errors.amount}>
					<span class="sym" aria-hidden="true">{currencySymbol}</span>
					<input
						class="input"
						id="x-amount"
						name="amount"
						inputmode="decimal"
						autocomplete="off"
						required
						defaultValue={values.amount}
						placeholder="0.00"
						aria-invalid={!!errors.amount}
						aria-describedby={errors.amount ? 'x-amount-e' : undefined}
					/>
				</div>
				{#if errors.amount}<span class="error-text" id="x-amount-e">✕ {errors.amount}</span>{/if}
			</div>
			<div class="field">
				<label class="label" for="x-date">Date</label>
				<DateField name="date" id="x-date" bind:value={date} label="Date" {today} max={today} required invalid={!!errors.date} />
				{#if errors.date}<span class="error-text">✕ {errors.date}</span>{/if}
			</div>
		</div>

		<div class="field">
			<label class="label" for="x-what">What for</label>
			<input
				class="input"
				id="x-what"
				name="what"
				required
				maxlength="80"
				autocomplete="off"
				defaultValue={values.what}
				placeholder="6 Corydoras, a new heater, fertilizer"
				aria-invalid={!!errors.what}
			/>
			{#if errors.what}<span class="error-text">✕ {errors.what}</span>{/if}
		</div>

		<fieldset class="field">
			<legend class="label">Category</legend>
			<div class="chips">
				{#each CATEGORIES as c (c.value)}
					<label class="chip"><input type="radio" name="category" value={c.value} bind:group={category} />{c.label}</label>
				{/each}
			</div>
		</fieldset>

		{#if tanks.length > 1}
			<div class="field">
				<label class="label" for="x-tank">Tank</label>
				<select class="input" id="x-tank" name="tankId" value={values.tankId}>
					{#each tanks as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
				</select>
			</div>
		{:else}
			<input type="hidden" name="tankId" value={values.tankId} />
		{/if}

		<div class="field">
			<label class="label" for="x-note">Note · optional</label>
			<textarea class="input" id="x-note" name="note" rows="2" maxlength="2000" placeholder="Where from, order number">{values.note}</textarea>
		</div>

		<div class="field">
			<span class="label" id="x-receipt-l">Receipt · optional</span>
			{#if receipt}
				<div class="has-receipt">
					<a href={receipt.href} target="_blank" rel="noopener">{receipt.type === 'application/pdf' ? 'View the PDF receipt' : 'View the receipt photo'}</a>
					<label class="check-row"><input type="checkbox" name="removeReceipt" /><span>Remove it</span></label>
				</div>
			{/if}
			<input
				class="file"
				type="file"
				name="receipt"
				accept="image/*,application/pdf"
				aria-labelledby="x-receipt-l"
				aria-describedby="x-receipt-h"
			/>
			<span class="hint" id="x-receipt-h">A photo or a PDF, up to 10 MB{receipt ? '. A new one replaces it.' : '.'}</span>
		</div>
	</div>

	<div class="foot">
		{#if mode === 'edit'}
			<button type="button" class="btn btn-danger remove" popovertarget="confirm-expense">Delete</button>
		{/if}
		<a class="btn hide-phone" href={cancelHref}>Cancel</a>
		<button class="btn btn-primary save" disabled={busy}>{busy ? 'Saving…' : mode === 'edit' ? 'Save' : 'Add expense'}</button>
	</div>
</form>

{#if mode === 'edit'}
	<ConfirmDelete id="confirm-expense" trigger={false} title="Delete this expense?" body="It comes off the tank's spending, with its receipt. This can't be undone." action="?/delete" />
{/if}

<style>
	.xform {
		max-width: 560px;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	.bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 8px 20px;
	}
	.cancel {
		font-size: 15px;
		color: var(--text-muted);
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-self: start;
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	.save-top {
		justify-self: end;
		color: var(--accent);
		font-weight: 700;
		font-size: 16px;
		min-height: 44px;
	}
	.body {
		flex: 1;
		padding: 8px 20px 12px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 8px;
	}
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 12px;
	}
	/* the currency before the amount, inside the field */
	.money {
		position: relative;
	}
	.money .sym {
		position: absolute;
		left: 14px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-muted);
		font-weight: 600;
		pointer-events: none;
	}
	.money .input {
		padding-left: 34px;
		font-size: 18px;
		font-weight: 700;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.has-receipt {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 16px;
		margin-bottom: 6px;
	}
	.has-receipt a {
		font-weight: 600;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.file {
		font-size: 14px;
		min-height: 44px;
	}
	.hint {
		font-size: 13px;
		color: var(--text-faint);
	}
	.foot {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		gap: 12px;
	}
	.save {
		flex: 1;
		height: 56px;
		border-radius: 0;
		font-size: 17px;
	}
	@media (min-width: 1024px) {
		.xform {
			min-height: 0;
			max-width: 640px;
			margin: 28px auto;
			padding: 24px 28px;
			background: var(--surface);
			border: 1px solid var(--border);
			border-radius: 0;
		}
		.body {
			padding: 0;
		}
		.xform :global(.input) {
			background-color: var(--surface-2);
			border-color: var(--border-strong);
		}
		.foot {
			margin-top: 24px;
			padding: 20px 0 0;
			border-top: 1px solid var(--border);
			justify-content: flex-end;
		}
		.foot .btn {
			height: 44px;
		}
		.save {
			flex: 0 0 auto;
			min-width: 140px;
			font-size: 15px;
			border-radius: 0;
		}
		.remove {
			margin-right: auto;
		}
	}
</style>
