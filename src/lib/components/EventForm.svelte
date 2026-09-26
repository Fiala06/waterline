<script lang="ts">
	import { untrack } from 'svelte';
	// 14 / G2–G5 / D13 · Log event: one layout that adapts to the category.
	import { enhance } from '$app/forms';
	import { queueable } from '$lib/offline';
	import { onMount } from 'svelte';
	import ConfirmDelete from './ConfirmDelete.svelte';
	import { ui } from '$lib/ui.svelte';
	import DateTimePicker from './DateTimePicker.svelte';
	import PhotoPicker from './PhotoPicker.svelte';
	import SpeciesInput from './SpeciesInput.svelte';
	import {
		CATEGORY_LABEL,
		DOSING_UNITS,
		EQUIPMENT_ACTIONS,
		EQUIPMENT_REASONS,
		LIVESTOCK_ACTIONS,
		LIVESTOCK_STATUS,
		LOG_CATEGORIES,
		MAINTENANCE_ACTIONS,
		OBSERVATION_TAGS,
		RECHECK_OPTIONS,
		WATER_SOURCES
	} from '$lib/events';
	import { whenLabel, type When } from '$lib/time';
	import { formatNumber, parseNumber } from '$lib/units';
	import type { EventCategory } from '$lib/types';

	let {
		mode = 'new',
		category,
		categoryHref,
		tankName,
		volUnit,
		tankVolume,
		tankVolumeIsActual,
		values = {},
		initialNote = '',
		initialWhen = null,
		timeZone,
		closeHref,
		task = null,
		recentProducts = [],
		error = null,
		errors = {},
		meta = null,
		existingPhotos = [],
		remove = null,
		inventory = null,
		water = null
	}: {
		mode?: 'new' | 'edit';
		category: EventCategory;
		categoryHref?: (c: EventCategory) => string;
		tankName: string;
		volUnit: string;
		tankVolume: number | null;
		tankVolumeIsActual: boolean;
		values?: Record<string, string | string[]>;
		initialNote?: string;
		initialWhen?: When | null;
		timeZone: string;
		closeHref: string;
		task?: { id: string; label: string; checked: boolean } | null;
		recentProducts?: { product: string; amount: unknown; unit: unknown; at: string }[];
		error?: string | null;
		errors?: Record<string, string>;
		meta?: string | null;
		existingPhotos?: { id: string }[];
		/** edit mode: the entry's delete action and its confirmation (G6 "Delete entry") */
		remove?: { action: string; title: string; body: string } | null;
		inventory?: {
			livestock: { id: string; name: string; count: number }[];
			plants: { id: string; name: string }[];
			equipment: { id: string; name: string }[];
		} | null;
		water?: 'fresh' | 'marine' | null;
	} = $props();



	const v = (k: string) => (typeof values[k] === 'string' ? (values[k] as string) : '');
	const list = (k: string) => (Array.isArray(values[k]) ? (values[k] as string[]) : values[k] ? [values[k] as string] : []);

	// Livestock / plants (G3): new entries add to or take from the tank's lists.
	let lsAction = $state(untrack(() => v('action') || 'added'));
	let lsKind = $state<'fish' | 'invert' | 'coral' | 'plant'>('fish');
	let lsTarget = $state('');
	let eqId = $state(untrack(() => inventory?.equipment[0]?.id ?? ''));
	const linked = $derived(mode === 'new' && !!inventory);
	const targetIsLivestock = $derived(lsTarget.startsWith('livestock:'));

	let when = $state<When | null>(untrack(() => initialWhen));
	let picking = $state(false);
	let clientId = $state('');
	let busy = $state(false);
	onMount(() => (clientId = crypto.randomUUID()));

	// Water change
	let amountMode = $state(v('amountMode') || 'percent');
	let amount = $state(untrack(() => v('amount') || (mode === 'new' ? '25' : '')));
	const wcNote = $derived.by(() => {
		const a = parseNumber(amount);
		if (a == null || !tankVolume) return '';
		const of = `${formatNumber(tankVolume, 1)} ${volUnit}${tankVolumeIsActual ? ' actual volume' : ''}`;
		return amountMode === 'percent'
			? `≈ ${formatNumber((tankVolume * a) / 100, 1)} ${volUnit} of ${of}`
			: `≈ ${formatNumber((a / tankVolume) * 100, 0)}% of ${of}`;
	});

	let note = $state(untrack(() => initialNote));
	let livestockStatus = $state(untrack(() => v('status') || 'in_tank'));
	let recheck = $state('3');

	// Dosing
	let product = $state(v('product'));
	let dosingUnit = $state(v('unit') || 'mL');
	const lastDose = $derived(
		recentProducts.find((r) => r.product.toLowerCase() === product.trim().toLowerCase())
	);
	function pickProduct(r: (typeof recentProducts)[number]) {
		product = r.product;
		if (typeof r.unit === 'string') dosingUnit = r.unit;
	}

	const saveLabel = $derived(
		mode === 'edit'
			? 'Save changes'
			: {
					water_change: 'Save water change',
					dosing: 'Save dosing',
					maintenance: 'Save maintenance',
					livestock: 'Save change',
					equipment: 'Save equipment change',
					observation: 'Save observation',
					note: 'Save note'
				}[category]
	);
	const title = $derived(
		mode === 'edit' ? `Edit ${CATEGORY_LABEL[category].toLowerCase()}` : category === 'note' ? 'Add note or photo' : 'Log event'
	);
	const fmtDose = (r: (typeof recentProducts)[number]) =>
		`Last dosed ${r.amount ?? ''} ${r.unit ?? ''} on ${new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone })}.`.replace(/\s+/g, ' ');
</script>

<form
	method="POST"
	enctype="multipart/form-data"
	class="eform"
	use:enhance={queueable({
		offline: mode === 'new',
		title: () =>
			category === 'water_change' && amount
				? `Water change · ${amount}${amountMode === 'percent' ? '%' : ` ${volUnit}`}`
				: category === 'dosing' && product
					? `Dosed ${product}`
					: CATEGORY_LABEL[category],
		closeHref: () => closeHref,
		timeZone,
		busy: (b) => (busy = b)
	})}
>
	<input type="hidden" name="clientId" value={clientId} />
	<input type="hidden" name="date" value={when?.date ?? ''} />
	<input type="hidden" name="time" value={when?.time ?? ''} />

	<div class="panel">
		<header class="head">
			<a class="btn-icon close" href={closeHref} aria-label="Close">✕</a>
			<div class="title">
				<h1>{title}</h1>
				<button type="button" class="sub" onclick={() => (picking = true)}>{tankName} · {whenLabel(when)} ▾</button>
			</div>
			<span class="spacer" aria-hidden="true"></span>
		</header>

		{#if meta}<p class="meta">{meta}</p>{/if}

		{#if mode === 'new' && categoryHref && category !== 'note'}
			<nav class="cats" aria-label="Category">
				{#each LOG_CATEGORIES as c (c)}
					<a class="chip" class:selected={c === category} aria-current={c === category ? 'page' : undefined} href={categoryHref(c)}
						>{CATEGORY_LABEL[c]}</a
					>
				{/each}
			</nav>
		{/if}

		{#if error}<p class="banner banner-bad" role="alert">✕ {error}</p>{/if}

		<div class="fields">
			{#if category === 'water_change'}
				<fieldset class="field">
					<legend class="label">Amount</legend>
					<div class="amount">
						<div class="segmented mini">
							<label><input type="radio" name="amountMode" value="percent" bind:group={amountMode} />%</label>
							<label><input type="radio" name="amountMode" value="volume" bind:group={amountMode} />{volUnit}</label>
						</div>
						<div class="unit-input grow">
							<input name="amount" inputmode="decimal" bind:value={amount} aria-label="Amount" aria-invalid={!!errors.amount} />
							<span class="unit">{amountMode === 'percent' ? '%' : volUnit}</span>
						</div>
					</div>
					{#if amountMode === 'percent'}
						<div class="quick">
							{#each ['10', '25', '50', '75'] as q (q)}
								<button type="button" class="chip" aria-pressed={amount === q} onclick={() => (amount = q)}>{q}%</button>
							{/each}
						</div>
					{/if}
					{#if wcNote}<span class="hint">{wcNote}</span>{/if}
					{#if errors.amount}<span class="error-text">✕ {errors.amount}</span>{/if}
				</fieldset>
				<fieldset class="field">
					<legend class="label">Source water</legend>
					<div class="options three">
						{#each WATER_SOURCES as s (s.value)}
							<label class="option"><input type="radio" name="source" value={s.value} defaultChecked={(v('source') || 'tap') === s.value} />{s.label}</label>
						{/each}
					</div>
				</fieldset>
			{:else if category === 'dosing'}
				<div class="field">
					<label class="label" for="product">Product</label>
					<input class="input" id="product" name="product" bind:value={product} list="recent-products" maxlength="80" autocomplete="off" placeholder="e.g. All-in-one fertilizer" aria-invalid={!!errors.product} />
					<datalist id="recent-products">
						{#each recentProducts as r (r.product)}<option value={r.product}></option>{/each}
					</datalist>
					{#if recentProducts.length && !product}
						<div class="quick">
							{#each recentProducts as r (r.product)}
								<button type="button" class="chip" onclick={() => pickProduct(r)}>{r.product}</button>
							{/each}
						</div>
					{/if}
					{#if errors.product}<span class="error-text">✕ {errors.product}</span>{/if}
				</div>
				<div class="pair">
					<div class="field">
						<label class="label" for="amount">Amount</label>
						<input class="input" id="amount" name="amount" inputmode="decimal" defaultValue={v('amount')} />
					</div>
					<div class="field">
						<label class="label" for="unit">Unit</label>
						<select class="input" id="unit" name="unit" bind:value={dosingUnit}>
							{#each DOSING_UNITS as u (u)}<option value={u}>{u}</option>{/each}
						</select>
					</div>
				</div>
				<span class="hint">
					{lastDose ? fmtDose(lastDose) + ' ' : ''}{recentProducts.length ? 'Recent products are listed first.' : ''}
				</span>
			{:else if category === 'maintenance'}
				<fieldset class="field">
					<legend class="label">What did you do?</legend>
					<div class="options two">
						{#each MAINTENANCE_ACTIONS as a (a)}
							<label class="option"><input type="checkbox" name="actions" value={a} defaultChecked={list('actions').includes(a)} />{a}</label>
						{/each}
					</div>
					{#if errors.actions}<span class="error-text">✕ {errors.actions}</span>{/if}
				</fieldset>
				{#if linked && inventory?.equipment.length}
					<div class="field">
						<label class="label" for="m-equipment">Equipment · optional</label>
						<select class="input" id="m-equipment" name="equipmentId">
							<option value="">—</option>
							{#each inventory.equipment as e (e.id)}<option value={e.id}>{e.name}</option>{/each}
						</select>
					</div>
				{/if}
			{:else if category === 'livestock' && linked && inventory}
				<input type="hidden" name="linked" value="1" />
				<fieldset class="field">
					<legend class="sr-only">Change</legend>
					<div class="options three">
						{#each LIVESTOCK_ACTIONS as a (a.value)}
							<label class="option"><input type="radio" name="action" value={a.value} bind:group={lsAction} />{a.label}</label>
						{/each}
					</div>
				</fieldset>
				{#if lsAction === 'added'}
					<div class="segmented" role="group" aria-label="Kind">
						{#each [['fish', 'Fish'], ['invert', 'Invert'], ['coral', 'Coral'], ['plant', 'Plant']] as [k, l] (k)}
							<label><input type="radio" name="kind" value={k} bind:group={lsKind} />{l}</label>
						{/each}
					</div>
					{#key lsKind}<SpeciesInput kind={lsKind} water={lsKind === 'plant' ? 'fresh' : water} invalid={!!errors.name} />{/key}
					{#if errors.name}<span class="error-text">✕ {errors.name}</span>{/if}
					{#if lsKind === 'plant'}
						<div class="field">
							<label class="label" for="position">Position</label>
							<select class="input" id="position" name="position">
								<option value="background">Background</option>
								<option value="midground" selected>Midground</option>
								<option value="foreground">Foreground</option>
								<option value="epiphyte">Epiphyte</option>
							</select>
						</div>
					{:else}
						<div class="pair">
							<div class="field">
								<label class="label" for="count">Count</label>
								<input class="input" id="count" name="count" inputmode="numeric" defaultValue="1" />
								{#if errors.count}<span class="error-text">✕ {errors.count}</span>{/if}
							</div>
							<div class="field">
								<label class="label" for="status">Status</label>
								<select class="input" id="status" name="status" bind:value={livestockStatus}>
									{#each LIVESTOCK_STATUS as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
								</select>
							</div>
						</div>
					{/if}
				{:else}
					<div class="field">
						<label class="label" for="target">Which one?</label>
						<select class="input" id="target" name="target" bind:value={lsTarget} aria-invalid={!!errors.target}>
							<option value="" disabled>Choose…</option>
							{#if inventory.livestock.length}
								<optgroup label="Livestock">
									{#each inventory.livestock as l (l.id)}<option value="livestock:{l.id}">{l.name} ({l.count})</option>{/each}
								</optgroup>
							{/if}
							{#if inventory.plants.length}
								<optgroup label="Plants">
									{#each inventory.plants as p (p.id)}<option value="plant:{p.id}">{p.name}</option>{/each}
								</optgroup>
							{/if}
						</select>
						{#if !inventory.livestock.length && !inventory.plants.length}<span class="hint">Nothing in this tank yet.</span>{/if}
						{#if errors.target}<span class="error-text">✕ {errors.target}</span>{/if}
					</div>
					{#if lsAction === 'removed' && targetIsLivestock}
						<div class="pair">
							<div class="field">
								<label class="label" for="count">How many</label>
								<input class="input" id="count" name="count" inputmode="numeric" defaultValue="1" />
								{#if errors.count}<span class="error-text">✕ {errors.count}</span>{/if}
							</div>
							<fieldset class="field">
								<legend class="label">Why</legend>
								<div class="segmented">
									<label><input type="radio" name="reason" value="loss" defaultChecked />Loss</label>
									<label><input type="radio" name="reason" value="rehomed" />Rehomed</label>
								</div>
							</fieldset>
						</div>
					{/if}
				{/if}
			{:else if category === 'livestock'}
				<fieldset class="field">
					<legend class="sr-only">Change</legend>
					<div class="options three">
						{#each LIVESTOCK_ACTIONS as a (a.value)}
							<label class="option"><input type="radio" name="action" value={a.value} defaultChecked={(v('action') || 'added') === a.value} />{a.label}</label>
						{/each}
					</div>
					{#if errors.action}<span class="error-text">✕ {errors.action}</span>{/if}
				</fieldset>
				<div class="field">
					<label class="label" for="name">Species</label>
					<input class="input" id="name" name="name" defaultValue={v('name')} maxlength="80" placeholder="e.g. Ember tetra" aria-invalid={!!errors.name} />
					{#if errors.name}<span class="error-text">✕ {errors.name}</span>{/if}
				</div>
				<div class="pair">
					<div class="field">
						<label class="label" for="count">Count</label>
						<input class="input" id="count" name="count" inputmode="numeric" defaultValue={v('count')} />
						{#if errors.count}<span class="error-text">✕ {errors.count}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="status">Status</label>
						<select class="input" id="status" name="status" bind:value={livestockStatus}>
							{#each LIVESTOCK_STATUS as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
						</select>
					</div>
				</div>
			{:else if category === 'equipment'}
				<fieldset class="field">
					<legend class="sr-only">Change</legend>
					<div class="options four">
						{#each EQUIPMENT_ACTIONS as a (a.value)}
							<label class="option"><input type="radio" name="action" value={a.value} defaultChecked={(v('action') || 'adjusted') === a.value} />{a.label}</label>
						{/each}
					</div>
				</fieldset>
				{#if linked && inventory?.equipment.length}
					<div class="field">
						<label class="label" for="equipmentId">Item</label>
						<select class="input" id="equipmentId" name="equipmentId" bind:value={eqId}>
							{#each inventory.equipment as e (e.id)}<option value={e.id}>{e.name}</option>{/each}
							<option value="">Something else…</option>
						</select>
					</div>
				{/if}
				<div class="field" hidden={linked && !!inventory?.equipment.length && eqId !== ''}>
					<label class="label" for="item">{linked && inventory?.equipment.length ? 'Name' : 'Item'}</label>
					<input class="input" id="item" name="item" defaultValue={v('item')} maxlength="80" placeholder="e.g. Canister filter" aria-invalid={!!errors.item} />
					{#if errors.item}<span class="error-text">✕ {errors.item}</span>{/if}
				</div>
				<fieldset class="field">
					<legend class="label">Why</legend>
					<div class="options two">
						{#each EQUIPMENT_REASONS as r (r)}
							<label class="option"><input type="checkbox" name="reasons" value={r} defaultChecked={list('reasons').includes(r)} />{r}</label>
						{/each}
					</div>
				</fieldset>
			{:else if category === 'observation'}
				<fieldset class="field">
					<legend class="label">What did you notice?</legend>
					<div class="options two">
						{#each OBSERVATION_TAGS as t (t)}
							<label class="option"><input type="checkbox" name="tags" value={t} defaultChecked={list('tags').includes(t)} />{t}</label>
						{/each}
					</div>
					{#if errors.tags}<span class="error-text">✕ {errors.tags}</span>{/if}
				</fieldset>
			{/if}

			<div class="field">
				<label class="label" for="note">Note</label>
				<textarea
					class="input"
					id="note"
					name="note"
					rows={category === 'note' ? 5 : 2}
					maxlength="2000"
					placeholder={category === 'maintenance' ? 'e.g. swapped sponge, kept ceramic' : 'Optional'}
					aria-invalid={!!errors.note}
					bind:value={note}
				></textarea>
				{#if errors.note}<span class="error-text">✕ {errors.note}</span>{/if}
			</div>

			<PhotoPicker existing={existingPhotos} />

			{#if category === 'observation' && mode === 'new'}
				<div class="field">
					<label class="label" for="recheck">Remind me to check again</label>
					<select class="input" id="recheck" name="recheck" bind:value={recheck}>
						{#each RECHECK_OPTIONS as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
					</select>
				</div>
			{/if}

			{#if task}
				<label class="check-row">
					<input type="checkbox" name="completeTask" value={task.id} defaultChecked={task.checked} />
					<span>{task.label}</span>
				</label>
			{/if}
			{#if remove}<button type="button" class="btn btn-danger remove" popovertarget="confirm-entry-delete">Delete entry</button>{/if}
		</div>

		<footer class="foot">
			<a class="btn cancel" href={closeHref}>Cancel</a>
			<button class="btn btn-primary save" disabled={busy}>{saveLabel}</button>
		</footer>
	</div>
</form>

{#if remove}
	<ConfirmDelete id="confirm-entry-delete" trigger={false} title={remove.title} body={remove.body} action={remove.action} fields={{ from: ui.prev ?? '' }} />
{/if}

<DateTimePicker bind:open={picking} value={when} {timeZone} onselect={(w) => (when = w)} />

<style>
	.eform {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	.panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 0 20px;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 0;
		gap: 12px;
	}
	.close {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.title {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	.sub {
		position: relative;
		font-size: 12px;
		color: var(--text-muted);
		min-height: 24px;
	}
	.sub::after {
		content: '';
		position: absolute;
		inset: -10px -8px; /* a 44px tap target without moving the title */
	}
	.spacer {
		width: 44px;
	}
	.meta {
		margin: 0 0 8px;
		font-size: 13px;
		color: var(--text-faint);
	}
	.cats {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		scrollbar-width: none;
		padding: 4px 0 8px;
		margin: 0 -20px;
		padding-left: 20px;
		padding-right: 20px;
	}
	.cats .chip {
		color: var(--text);
		height: 40px;
		border-radius: 20px;
	}
	.cats .chip.selected {
		color: var(--on-accent);
	}
	.banner {
		margin: 8px 0 0;
	}
	.fields {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding-top: 12px;
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
	.amount {
		display: flex;
		gap: 8px;
		align-items: stretch;
	}
	.mini {
		width: 128px;
		flex-shrink: 0;
	}
	.mini label {
		min-height: 42px;
		font-size: 15px;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.quick {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.quick .chip[aria-pressed='true'] {
		color: var(--on-accent);
	}
	.hint {
		font-size: 13px;
		color: var(--text-faint);
	}
	.two {
		grid-template-columns: 1fr 1fr;
	}
	.three {
		grid-template-columns: repeat(3, 1fr);
	}
	.four {
		grid-template-columns: repeat(4, 1fr);
	}
	.four .option {
		font-size: 14px;
	}
	@media (max-width: 380px) {
		.four {
			grid-template-columns: 1fr 1fr;
		}
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.remove {
		width: 100%;
		margin-top: 8px;
	}
	.foot {
		position: sticky;
		bottom: 0;
		margin: 20px -20px 0;
		margin-top: auto;
		padding: 14px 20px calc(28px + env(safe-area-inset-bottom));
		background: var(--bg);
		border-top: 1px solid var(--divider-soft);
		display: flex;
		gap: 12px;
	}
	.cancel {
		display: none;
	}
	.save {
		flex: 1;
		height: 56px;
		border-radius: 14px;
		font-size: 17px;
	}
	@media (min-width: 1024px) {
		.eform {
			min-height: 0;
			padding: 32px;
			align-items: center;
		}
		.panel {
			width: 600px;
			flex: none;
			border-radius: 20px;
			background: var(--surface);
			border: 1px solid var(--border-strong);
			box-shadow: var(--shadow-modal);
			padding: 0 24px;
		}
		.head {
			padding: 22px 0 12px;
			justify-content: flex-start;
		}
		.close {
			order: 3;
			background: transparent;
		}
		.title {
			flex: 1;
			align-items: flex-start;
		}
		h1 {
			font-size: 22px;
		}
		.spacer {
			display: none;
		}
		.cats {
			margin: 0;
			padding: 4px 0 8px;
			flex-wrap: wrap;
		}
		.foot {
			position: static;
			margin: 24px -24px 0;
			padding: 16px 24px 22px;
			border-top: 1px solid var(--border);
			background: transparent;
			justify-content: flex-end;
		}
		.cancel {
			display: inline-flex;
			font-weight: 400;
		}
		.save {
			flex: none;
			height: 46px;
			border-radius: 12px;
			font-size: 15px;
			padding: 0 22px;
		}
	}
</style>
