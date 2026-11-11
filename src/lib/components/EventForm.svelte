<script lang="ts">
	import { untrack } from 'svelte';
	// 14 / G2–G5 / D13 · Log event: one layout that adapts to the category.
	// The frame is LogFormShell; each category's fields are their own (event-fields/,
	// WaterChangeFields). This keeps what they share: the Note, the photos, the
	// livestock preview, the equipment hint and "Remind me to check again".
	import { page } from '$app/state';
	import LogFormShell from './LogFormShell.svelte';
	import PhotoPicker from './PhotoPicker.svelte';
	import WaterChangeFields from './WaterChangeFields.svelte';
	import DosingFields from './event-fields/DosingFields.svelte';
	import EquipmentFields from './event-fields/EquipmentFields.svelte';
	import FeedingFields from './event-fields/FeedingFields.svelte';
	import LivestockFields from './event-fields/LivestockFields.svelte';
	import MaintenanceFields from './event-fields/MaintenanceFields.svelte';
	import ObservationFields from './event-fields/ObservationFields.svelte';
	import { RECHECK_OPTIONS } from '$lib/events';
	import { logCompletes, type ReminderTask } from '$lib/tasks';
	import type { When } from '$lib/time';
	import { eventTypes } from './entry-form';
	import { eventQueueTitle, eventSaveLabel, eventTitle, listOf, livestockPreview, notePlaceholder, targetAnimal, valueOf, type FormValues } from './event-form';
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
		returnTo = null,
		task = null,
		lastAmountMode = 'percent',
		lastAmount = null,
		recentProducts = [],
		recentAdditives = [],
		recentFoods = [],
		productLinks = [],
		error = null,
		errors = {},
		meta = null,
		existingPhotos = [],
		remove = null,
		inventory = null,
		water = null,
		ontankclick,
		draftKey = null,
		doseRoutines = []
	}: {
		mode?: 'new' | 'edit';
		category: EventCategory;
		categoryHref?: (c: EventCategory) => string;
		tankName: string;
		volUnit: string;
		tankVolume: number | null;
		tankVolumeIsActual: boolean;
		values?: FormValues;
		initialNote?: string;
		initialWhen?: When | null;
		timeZone: string;
		closeHref: string;
		/** where saving goes back to (a page in the app), instead of the dashboard */
		returnTo?: string | null;
		task?: { id: string; label: string; sub?: string; checked: boolean } | null;
		/** Dosing: the tank's dosing routines, the one for the product dosed offered to complete (#167) */
		doseRoutines?: { id: string; product: string; label: string; sub: string; schedule: ReminderTask; lastDone: string | null; today: string }[];
		/** % or volume, and how much, as the last water change was logged */
		lastAmountMode?: 'percent' | 'volume';
		lastAmount?: string | null;
		recentProducts?: { product: string; amount: unknown; unit: unknown; at: string }[];
		/** Water change: conditioners and remineralisers added before, then dosed products */
		recentAdditives?: { product: string; amount: unknown; unit: unknown; at: string }[];
		/** Feeding: foods fed before, by hand or by a routine */
		recentFoods?: { food: string; amount: unknown; unit: unknown; at: string }[];
		/** Saved products (Settings → Products): dosing one shows its Reorder link */
		productLinks?: { name: string; url: string }[];
		error?: string | null;
		errors?: Record<string, string>;
		meta?: string | null;
		existingPhotos?: { id: string }[];
		/** edit mode: the entry's delete action and its confirmation (G6 "Delete entry") */
		remove?: { action: string; title: string; body: string } | null;
		inventory?: {
			livestock: { id: string; name: string; count: number; status?: string; scientific?: string | null }[];
			plants: { id: string; name: string }[];
			equipment: { id: string; name: string }[];
		} | null;
		water?: 'fresh' | 'marine' | null;
		ontankclick?: () => void;
		/** New entries: keep what was typed on this device until it's saved */
		draftKey?: string | null;
	} = $props();

	const v = (k: string) => valueOf(values, k);
	const list = (k: string) => listOf(values, k);

	let when = $state<When | null>(untrack(() => initialWhen));
	let note = $state(untrack(() => initialNote));
	let recheck = $state('3');
	// New entries add to or take from the tank's lists (G3), and pick its equipment.
	const linked = $derived(mode === 'new' && !!inventory);
	const tankEquipment = $derived(linked ? (inventory?.equipment ?? []) : []);

	// What the categories' fields hold that the rest of the form reads: the
	// queue's title, the dose's routine, the livestock preview, the equipment hint.
	// Water change
	let amountMode = $state(untrack(() => v('amountMode') || lastAmountMode));
	let amount = $state(untrack(() => v('amount') || (mode === 'new' ? lastAmount || '25' : '')));
	const initialAdditives = untrack(() =>
		list('additive_product').map((product, i) => ({ product, amount: list('additive_amount')[i] ?? '', unit: list('additive_unit')[i] ?? '' }))
	);
	// Dosing
	let product = $state(untrack(() => v('product')));
	// Feeding
	let food = $state(untrack(() => v('food')));
	// Livestock / plants
	let lsAction = $state(untrack(() => v('action') || 'added'));
	let lsKind = $state<'fish' | 'invert' | 'coral' | 'plant'>('fish');
	let lsTarget = $state('');
	let lsStatus = $state(untrack(() => v('status') || 'in_tank'));
	let count = $state(untrack(() => v('count') || (mode === 'new' ? '1' : '')));
	let species = $state({ name: '', scientific: '' });
	// Equipment
	let eqId = $state(untrack(() => inventory?.equipment[0]?.id ?? ''));
	let eqAction = $state(untrack(() => v('action') || 'adjusted'));

	// G3: "Livestock tab: Ember tetra 0 → 10 · 41 animals total"
	const preview = $derived(
		linked && inventory
			? livestockPreview(inventory.livestock, {
					action: lsAction,
					kind: lsKind,
					status: lsStatus,
					count,
					species,
					target: targetAnimal(inventory.livestock, lsTarget)
				})
			: null
	);

	// "Also mark the reminder “Water change 25%” done" (the frame shows it);
	// a dose: the routine for the product typed, ticked when the dose is this one (#167)
	const routine = $derived(category === 'dosing' ? (doseRoutines.find((r) => r.product.trim().toLowerCase() === product.trim().toLowerCase()) ?? null) : null);
	const offered = $derived(
		task ?? (routine ? { ...routine, checked: logCompletes(routine.schedule, routine.lastDone, when?.date ?? routine.today) } : null)
	);

	const saveLabel = $derived(eventSaveLabel(mode, category));
	const title = $derived(eventTitle(mode, category));
	// the types at the top (README § 11): Test, then every kind of entry as an equal chip
	const types = $derived(categoryHref ? eventTypes(page.url.searchParams, category, categoryHref) : null);

	// Notes start one line tall (14, G2) and grow with what's typed.
	function autosize(el: HTMLTextAreaElement) {
		const fit = () => {
			el.style.height = 'auto';
			el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
		};
		fit();
		el.addEventListener('input', fit);
		return { destroy: () => el.removeEventListener('input', fit) };
	}
</script>

<LogFormShell
	class="eform"
	layout="fields"
	{mode}
	{tankName}
	{ontankclick}
	{types}
	{title}
	bind:when
	{initialWhen}
	{timeZone}
	{closeHref}
	{returnTo}
	{draftKey}
	queueTitle={() => eventQueueTitle(category, { amount, amountMode, volUnit, product, food })}
	{meta}
	{error}
	task={offered}
	{remove}
	{saveLabel}
>
	{#snippet fields(onphotos)}
		{#if category === 'water_change'}
			<WaterChangeFields
				bind:amountMode
				bind:amount
				source={v('source') || 'tap'}
				{volUnit}
				{tankVolume}
				{tankVolumeIsActual}
				error={errors.amount}
				additives={initialAdditives}
				recentProducts={recentAdditives}
				{errors}
			/>
		{:else if category === 'dosing'}
			<DosingFields {mode} bind:product {values} {errors} {recentProducts} {productLinks} {timeZone} />
		{:else if category === 'feeding'}
			<FeedingFields {mode} bind:food {values} {errors} {recentFoods} />
		{:else if category === 'maintenance'}
			<MaintenanceFields {values} {errors} equipment={tankEquipment} />
		{:else if category === 'livestock'}
			<LivestockFields
				bind:action={lsAction}
				bind:kind={lsKind}
				bind:status={lsStatus}
				bind:count
				bind:target={lsTarget}
				bind:species
				{values}
				{errors}
				inventory={linked ? inventory : null}
				{water}
			/>
		{:else if category === 'equipment'}
			<EquipmentFields bind:action={eqAction} bind:item={eqId} {values} {errors} equipment={tankEquipment} />
		{:else if category === 'observation'}
			<ObservationFields {values} {errors} />
		{/if}

		<div class="field">
			<label class="label" for="note">Note</label>
			<textarea
				class="input note"
				class:long={category === 'note'}
				id="note"
				name="note"
				rows={category === 'note' ? 5 : 1}
				maxlength="2000"
				placeholder={notePlaceholder(category)}
				aria-invalid={!!errors.note}
				bind:value={note}
				use:autosize
			></textarea>
			{#if errors.note}<span class="error-text">✕ {errors.note}</span>{/if}
		</div>

		<PhotoPicker existing={existingPhotos} ontaken={onphotos} />
	{/snippet}

	{#snippet beforeTask()}
		{#if category === 'livestock' && preview}
			<p class="preview">
				Livestock tab: {preview.name}
				<b>{preview.from} → {preview.to}</b> · <span class="nowrap">{preview.total} animal{preview.total === 1 ? '' : 's'} total</span>
			</p>
		{/if}

		{#if category === 'equipment' && linked && eqId && eqAction === 'removed'}
			<p class="hint">Updates the item on the Equipment tab.</p>
		{/if}

		{#if category === 'observation' && mode === 'new'}
			<!-- G5: one row, the choice on the right -->
			<label class="remind">
				<span>Remind me to check again</span>
				<span class="remind-pick">
					<select name="recheck" bind:value={recheck}>
						{#each RECHECK_OPTIONS as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
					</select>
					<span class="caret" aria-hidden="true">▾</span>
				</span>
			</label>
		{/if}
	{/snippet}
</LogFormShell>

<style>
	/* a field scrolled or tabbed to stays clear of the sticky Save bar */
	:global(html:has(.eform)) {
		scroll-padding-bottom: 112px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	.preview {
		margin: 0;
		padding: 10px 0;
		border-top: 1px solid var(--divider);
		border-bottom: 1px solid var(--divider);
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-2);
	}
	.preview b {
		color: var(--text);
	}
	.nowrap {
		white-space: nowrap;
	}

	/* ── Note ── */
	.note {
		min-height: 44px;
		padding-top: 10px;
		padding-bottom: 10px;
		font-size: 16px;
		resize: none;
		overflow-y: hidden;
	}
	.note.long {
		min-height: 140px;
	}

	/* ── "Remind me to check again" ── */
	.remind {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 48px;
		padding: 2px 0;
		border-top: 1px solid var(--divider);
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
	}
	.remind-pick {
		position: relative;
		display: flex;
		align-items: center;
		color: var(--accent-text);
	}
	.remind select {
		appearance: none;
		-webkit-appearance: none;
		min-height: 44px;
		padding: 0 26px 0 8px;
		border: none;
		background: transparent;
		color: var(--accent-text);
		font-size: 14px;
		font-weight: 800;
		cursor: pointer;
		text-align: right;
		text-align-last: right;
	}
	.remind select:focus-visible {
		outline: 2px solid var(--accent);
	}
	.remind .caret {
		position: absolute;
		right: 10px;
		pointer-events: none;
		font-size: 13px;
	}

	@media (min-width: 1024px) {
		:global(html:has(.eform)) {
			scroll-padding-bottom: 96px;
		}
		/* the frame's .fields hold this form's fields and its categories' (event-fields/, WaterChangeFields) */
		:global(.eform .fields .field) {
			gap: 6px;
		}
		:global(.eform .fields .field > .label) {
			font-size: 13px;
		}
		.note,
		:global(.eform .fields) .note {
			height: auto;
			min-height: 44px;
			padding: 10px 12px;
		}
		.note.long {
			min-height: 120px;
		}
	}
</style>
