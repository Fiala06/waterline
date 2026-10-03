<script lang="ts">
	// Wish list (#24): what's planned for the tank, with a note, a price or a link.
	// Add to tank puts an item in Livestock, Plants or Equipment with the usual
	// History entry, and can log the purchase in Spending. Owners edit; others read.
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import SpeciesInput from '$lib/components/SpeciesInput.svelte';
	import type { WishKind } from '$lib/server/db/schema';
	let { data, form } = $props();
	const errors = $derived(form?.errors ?? {});
	const values = $derived(form?.values ?? {});
	let kind = $state<WishKind>(untrack(() => (form?.values?.kind as WishKind) || 'fish'));
	let count = $state(untrack(() => Number(form?.values?.count) || 1));
	// the other fields, so a saved wish clears the form (reset alone leaves Svelte's values)
	let name = $state(untrack(() => values.name ?? ''));
	let price = $state(untrack(() => values.price ?? ''));
	let url = $state(untrack(() => values.url ?? ''));
	let note = $state(untrack(() => values.note ?? ''));
	let generation = $state(0);
	function clear() {
		name = price = url = note = '';
		count = 1;
		generation++;
	}
	const livestock = $derived(kind === 'fish' || kind === 'invert' || kind === 'coral');
	// Add to tank: which row is open, and whether the purchase goes in Spending
	let adding = $state<string | null>(untrack(() => form?.addError?.id ?? null));
	let spend = $state(true);
	const owner = $derived(data.role === 'owner');
	const KINDS: { value: WishKind; label: string }[] = [
		{ value: 'fish', label: 'Fish' },
		{ value: 'invert', label: 'Invert' },
		{ value: 'coral', label: 'Coral' },
		{ value: 'plant', label: 'Plant' },
		{ value: 'equipment', label: 'Equipment' }
	];
</script>

<svelte:head><title>Wish list · {data.tank.name} · Waterline</title></svelte:head>

<div class="page">
	<div class="phead hide-desk">
		<a class="back sub-back" href="/tanks/{data.tank.id}/livestock">‹ Livestock</a>
		<h1 class="title">Wish list</h1>
	</div>
	<p class="lede">
		Fish, plants and equipment you plan to add to {data.tank.name}, with a note and a price or link. Add to tank puts an item in Livestock, Plants or Equipment with its History entry,
		and can log what it cost in Spending.
	</p>

	{#if owner}
		<form
			method="POST"
			action="?/add"
			class="add"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'redirect') clear();
				}}
		>
			<h2 class="kicker">Add to the list</h2>
			<fieldset class="field">
				<legend class="label">What</legend>
				<div class="segmented kinds" role="group" aria-label="Kind">
					{#each KINDS as k (k.value)}
						<label><input type="radio" name="kind" value={k.value} bind:group={kind} />{k.label}</label>
					{/each}
				</div>
			</fieldset>
			{#if kind === 'equipment'}
				<div class="row">
					<div class="field grow">
						<label class="label" for="wish-name">Item</label>
						<input class="input" id="wish-name" name="name" maxlength="80" placeholder="e.g. Fluval 307" bind:value={name} aria-invalid={!!errors.name} />
						{#if errors.name}<span class="error-text">✕ {errors.name}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="wish-type">Kind of equipment</label>
						<select class="input" id="wish-type" name="equipmentType" value={values.equipmentType || 'filter'} aria-invalid={!!errors.equipmentType}>
							{#each data.equipmentTypes as t (t.value)}<option value={t.value}>{t.label}</option>{/each}
						</select>
					</div>
				</div>
			{:else}
				<div class="row">
					<div class="grow">
						{#key `${kind}-${generation}`}<SpeciesInput id="wish-name" {kind} water={kind === 'plant' ? 'fresh' : data.water} label={kind === 'plant' ? 'Plant' : 'Species'} initialName={values.name ?? ''} initialScientific={values.scientificName ?? ''} invalid={!!errors.name} />{/key}
						{#if errors.name}<span class="error-text">✕ {errors.name}</span>{/if}
					</div>
					{#if livestock}
						<div class="field">
							<label class="label" for="wish-count">How many</label>
							<div class="count-stepper">
								<button type="button" aria-label="Fewer" disabled={Number(count) <= 1} onclick={() => (count = Math.max(1, Number(count) - 1))}>−</button>
								<input id="wish-count" name="count" inputmode="numeric" bind:value={count} aria-invalid={!!errors.count} />
								<button type="button" aria-label="More" onclick={() => (count = (Number(count) || 0) + 1)}>+</button>
							</div>
							{#if errors.count}<span class="error-text">✕ {errors.count}</span>{/if}
						</div>
					{/if}
				</div>
			{/if}
			<div class="row">
				<div class="field">
					<label class="label" for="wish-price">Price · optional</label>
					<div class="money">
						<span class="cur">{data.currency}</span>
						<input class="input" id="wish-price" name="price" inputmode="decimal" placeholder="0.00" bind:value={price} aria-invalid={!!errors.price} />
					</div>
					{#if errors.price}<span class="error-text">✕ {errors.price}</span>{/if}
				</div>
				<div class="field grow">
					<label class="label" for="wish-url">Link · optional</label>
					<input class="input" id="wish-url" name="url" type="url" inputmode="url" placeholder="https://" bind:value={url} aria-invalid={!!errors.url} />
					{#if errors.url}<span class="error-text">✕ {errors.url}</span>{/if}
				</div>
			</div>
			<div class="field">
				<label class="label" for="wish-note">Note · optional</label>
				<input class="input" id="wish-note" name="note" maxlength="300" placeholder="Why, where from, what to check first" bind:value={note} />
			</div>
			<button class="btn btn-primary save">Add to wish list</button>
		</form>
	{/if}

	<section aria-labelledby="planned-h">
		<h2 class="kicker" id="planned-h">
			Planned · {data.totals.count}{#if data.totals.money}<span class="sum">{` · ${data.totals.money}`}</span>{/if}
		</h2>
		{#if !data.items.length}
			<p class="empty">Nothing on the list yet.{owner ? ' Add the fish, plant or gear you have your eye on.' : ''}</p>
		{:else}
			<ul class="list">
				{#each data.items as w (w.id)}
					<li class="wish" class:open={adding === w.id}>
						<div class="main">
							<div class="who">
								<span class="name">{w.name}</span>
								<span class="meta">
									{w.kindLabel}{#if w.scientific}{' · '}<i>{w.scientific}</i>{/if}{#if w.host}{' · '}<a href={w.url} target="_blank" rel="noopener noreferrer">{w.host} ↗</a>{/if}
								</span>
								{#if w.note}<span class="note">{w.note}</span>{/if}
							</div>
							<span class="price num">{w.price ?? ''}</span>
							{#if owner}
								<div class="acts">
									<button type="button" class="btn" aria-expanded={adding === w.id} onclick={() => (adding = adding === w.id ? null : w.id)}>Add to tank</button>
									<form method="POST" action="?/delete" use:enhance>
										<input type="hidden" name="id" value={w.id} />
										<button class="btn-text danger">Delete<span class="sr-only"> {w.name}</span></button>
									</form>
								</div>
							{/if}
						</div>
						{#if owner && adding === w.id}
							<form method="POST" action="?/addToTank" class="confirm" use:enhance>
								<input type="hidden" name="id" value={w.id} />
								<p class="ask">
									Adds <b>{w.name}</b> to {w.kind === 'equipment' ? 'Equipment' : w.kind === 'plant' ? 'Plants' : 'Livestock'} today, with a History entry.
								</p>
								<label class="check"><input type="checkbox" name="spend" bind:checked={spend} />Log the purchase in Spending</label>
								{#if spend}
									<div class="field amount">
										<label class="label" for="paid-{w.id}">Paid</label>
										<div class="money">
											<span class="cur">{data.currency}</span>
											<input class="input" id="paid-{w.id}" name="amount" inputmode="decimal" placeholder="0.00" value={form?.addError?.id === w.id ? '' : w.priceInput} aria-invalid={form?.addError?.id === w.id} />
										</div>
										{#if form?.addError?.id === w.id}<span class="error-text">✕ {form.addError.error}</span>{/if}
									</div>
								{/if}
								<div class="confirm-acts">
									<button class="btn btn-primary">Add to tank</button>
									<button type="button" class="btn-text" onclick={() => (adding = null)}>Cancel</button>
								</div>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if data.added.length}
		<section aria-labelledby="added-h">
			<h2 class="kicker" id="added-h">Added to the tank · {data.added.length}</h2>
			<ul class="list">
				{#each data.added as w (w.id)}
					<li class="wish done">
						<div class="main">
							<div class="who">
								<span class="name">✓ {w.name}</span>
								<span class="meta">{w.kindLabel} · added {w.added}</span>
							</div>
							<span class="price num">{w.price ?? ''}</span>
							{#if owner}
								<div class="acts">
									<form method="POST" action="?/delete" use:enhance>
										<input type="hidden" name="id" value={w.id} />
										<button class="btn-text">Clear<span class="sr-only"> {w.name} from the list</span></button>
									</form>
								</div>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.page {
		padding: 8px 20px 32px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 880px;
	}
	.phead {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.title {
		margin: 0;
		font-size: 28px;
	}
	.lede {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
		max-width: 620px;
	}
	.kicker {
		margin: 0;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		font-weight: 800;
	}
	.sum {
		color: var(--text-muted);
		font-weight: 600;
	}
	/* the add box: a 2px ink border, like Sharing's Invite */
	.add {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 14px;
		border: 2px solid var(--ink);
	}
	.add .kicker {
		border-bottom: none;
		padding-bottom: 0;
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
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: flex-start;
	}
	.grow {
		flex: 1 1 240px;
		min-width: 0;
	}
	.row .field:not(.grow) {
		flex: 0 1 180px;
	}
	.row .input,
	.add select.input {
		min-height: 44px;
	}
	.count-stepper {
		display: flex;
		width: 100%;
		height: 44px;
		padding: 0 4px;
		background: var(--surface);
		border-color: var(--border);
	}
	.count-stepper input {
		flex: 1;
		align-self: stretch;
		width: 0;
		font-size: 16px;
		font-weight: 700;
	}
	.count-stepper button {
		font-size: 22px;
		color: var(--text-2);
		border-radius: 0;
	}
	.count-stepper button:disabled {
		color: var(--placeholder);
	}
	.money {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.cur {
		font-size: 13px;
		color: var(--text-muted);
	}
	.money .input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
	}
	.save {
		align-self: flex-start;
		min-height: 44px;
	}
	.empty {
		margin: 0;
		padding: 16px 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.wish {
		border-bottom: 1px solid var(--divider);
	}
	.main {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 8px 16px;
		min-height: 56px;
		padding: 10px 0;
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.name {
		font-size: 15px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.done .name {
		color: var(--text-muted);
	}
	.meta,
	.note {
		font-size: 12px;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.note {
		color: var(--text-2);
		font-size: 13px;
	}
	.meta a {
		color: inherit;
		text-decoration: underline;
	}
	.price {
		font-size: 14px;
		font-weight: 700;
		white-space: nowrap;
	}
	.acts {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.acts .btn,
	.acts .btn-text {
		min-height: 44px;
	}
	.acts .btn-text {
		padding: 0;
		font-size: 14px;
	}
	.danger {
		color: var(--accent-text);
	}
	/* Add to tank, opened under the row */
	.confirm {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 0 0 14px;
	}
	.ask {
		margin: 0;
		font-size: 14px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		font-size: 14px;
	}
	.check input {
		width: 20px;
		height: 20px;
	}
	.amount {
		max-width: 200px;
	}
	.confirm-acts {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.confirm-acts .btn,
	.confirm-acts .btn-text {
		min-height: 44px;
	}
	@media (max-width: 599px) {
		/* five kinds don't fit one row on a phone: livestock first, then Plant and Equipment */
		.kinds {
			grid-auto-flow: row;
			grid-template-columns: repeat(3, 1fr);
		}
		.kinds label:nth-child(4) {
			border-left: none;
		}
		.kinds label:nth-child(n + 4) {
			border-top: 1px solid var(--divider);
		}
		.kinds label:nth-child(5) {
			grid-column: span 2;
		}
		.main {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.acts {
			grid-column: 1 / -1;
		}
	}
	@media (min-width: 1024px) {
		.page {
			padding: 24px 32px 48px;
		}
	}
</style>
