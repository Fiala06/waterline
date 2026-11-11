<script lang="ts">
	import { untrack } from 'svelte';
	// 14 / G2–G5 / D13 · Log event: one layout that adapts to the category.
	import { page } from '$app/state';
	import DoseFields from './DoseFields.svelte';
	import EquipmentFields from './EquipmentFields.svelte';
	import FeedFields from './FeedFields.svelte';
	import LivestockFields from './LivestockFields.svelte';
	import LogFormShell from './LogFormShell.svelte';
	import MaintenanceFields from './MaintenanceFields.svelte';
	import ObservationFields from './ObservationFields.svelte';
	import PhotoDateOffer from './PhotoDateOffer.svelte';
	import PhotoPicker from './PhotoPicker.svelte';
	import TaskCheckRow from './TaskCheckRow.svelte';
	import WaterChangeFields from './WaterChangeFields.svelte';
	import { CATEGORY_LABEL, RECHECK_OPTIONS } from '$lib/events';
	import { logCompletes, type ReminderTask } from '$lib/tasks';
	import type { ExifDate } from '$lib/exif';
	import type { When } from '$lib/time';
	import { entryHref } from './entry-form';
	import { eventSaveLabel, eventTitle, type livestockPreview } from './event-form';
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
		values?: Record<string, string | string[]>;
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

	const v = (k: string) => (typeof values[k] === 'string' ? (values[k] as string) : '');
	const list = (k: string) => (Array.isArray(values[k]) ? (values[k] as string[]) : values[k] ? [values[k] as string] : []);

	// New entries change the tank's lists (livestock, plants, equipment)
	const linked = $derived(mode === 'new' && !!inventory);

	let when = $state<When | null>(untrack(() => initialWhen));

	// A photo taken on another day than the entry (#42): offer its date, without changing the entry by itself.
	let photoDates = $state<(ExifDate | null)[]>([]);

	// What the category's fields hold that the rest of the form reads: the
	// queued entry's name, the dose's routine, and the lines under the photos.
	let amountMode = $state(untrack(() => v('amountMode') || lastAmountMode));
	let amount = $state(untrack(() => v('amount') || (mode === 'new' ? lastAmount || '25' : '')));
	let product = $state(v('product'));
	let food = $state(v('food'));
	let eqId = $state(untrack(() => inventory?.equipment[0]?.id ?? ''));
	let eqAction = $state(untrack(() => v('action') || 'adjusted'));
	// G3: "Livestock tab: Ember tetra 0 → 10 · 41 animals total"
	let preview = $state<ReturnType<typeof livestockPreview> | null>(null);

	let note = $state(untrack(() => initialNote));
	let recheck = $state('3');

	// Water change: what went in
	const initialAdditives = untrack(() =>
		list('additive_product').map((product, i) => ({ product, amount: list('additive_amount')[i] ?? '', unit: list('additive_unit')[i] ?? '' }))
	);

	// "Also mark the reminder “Water change 25%” done", with where it stands on its own line
	// a dose: the routine for the product typed, ticked when the dose is this one (#167)
	const routine = $derived(category === 'dosing' ? (doseRoutines.find((r) => r.product.trim().toLowerCase() === product.trim().toLowerCase()) ?? null) : null);
	const offered = $derived(
		task ?? (routine ? { ...routine, checked: logCompletes(routine.schedule, routine.lastDone, when?.date ?? routine.today) } : null)
	);

	const saveLabel = $derived(eventSaveLabel(mode, category));
	const title = $derived(eventTitle(mode, category));
	// the types at the top (README § 11): Test, then every kind of entry as an equal chip
	const typeHref = (t: 'test' | EventCategory) => (t === 'test' ? entryHref(page.url.searchParams, '/entries/test/new') : categoryHref!(t));

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
	{mode}
	current={category}
	typeHref={mode === 'new' && categoryHref ? typeHref : null}
	{tankName}
	{title}
	bind:when
	{timeZone}
	{closeHref}
	{returnTo}
	{saveLabel}
	queueTitle={() =>
		category === 'water_change' && amount
			? `Water change · ${amount}${amountMode === 'percent' ? '%' : ` ${volUnit}`}`
			: category === 'dosing' && product
				? `Dosed ${product}`
				: category === 'feeding' && food
					? `Fed ${food}`
					: CATEGORY_LABEL[category]}
	{draftKey}
	{meta}
	{error}
	{remove}
	{ontankclick}
>
	<div class="fields">
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
		{:else}
			<!-- the other categories' fields, sharing this form's styles for them -->
			<div class="cat">
				{#if category === 'dosing'}
					<DoseFields {mode} bind:product amount={v('amount')} unit={v('unit')} {errors} {recentProducts} {productLinks} {timeZone} />
				{:else if category === 'feeding'}
					<FeedFields {mode} bind:food amount={v('amount')} unit={v('unit')} {errors} {recentFoods} />
				{:else if category === 'maintenance'}
					<MaintenanceFields actions={list('actions')} {errors} equipment={linked ? inventory?.equipment : []} />
				{:else if category === 'livestock'}
					<LivestockFields
						{mode}
						inventory={linked ? inventory : null}
						action={v('action')}
						status={v('status')}
						count={v('count')}
						name={v('name')}
						{errors}
						{water}
						bind:preview
					/>
				{:else if category === 'equipment'}
					<EquipmentFields
						bind:action={eqAction}
						bind:equipmentId={eqId}
						item={v('item')}
						reasons={list('reasons')}
						{errors}
						equipment={linked ? inventory?.equipment : []}
					/>
				{:else if category === 'observation'}
					<ObservationFields tags={list('tags')} {errors} />
				{/if}
			</div>
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
				placeholder={category === 'maintenance' ? 'e.g. swapped sponge, kept ceramic' : category === 'note' ? undefined : 'Optional'}
				aria-invalid={!!errors.note}
				bind:value={note}
				use:autosize
			></textarea>
			{#if errors.note}<span class="error-text">✕ {errors.note}</span>{/if}
		</div>

		<PhotoPicker existing={existingPhotos} ontaken={(d) => (photoDates = d)} />
		<PhotoDateOffer dates={photoDates} bind:when {timeZone} />

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

		{#if offered}
			{#key offered.id}<TaskCheckRow task={offered} entryDate={when?.date} />{/key}
		{/if}
	</div>
</LogFormShell>

<style>
	.fields {
		display: flex;
		flex-direction: column;
		gap: 18px;
		margin-top: 16px;
	}
	/* what the category fields (DoseFields, LivestockFields…) share; the water change keeps its own */
	.cat {
		display: contents;
	}
	.cat :global(legend) {
		margin-bottom: 8px;
	}
	.hint,
	.cat :global(.hint) {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	/* product or food, amount, unit: one row on desktop */
	.cat :global(.trio) {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px 12px;
		align-items: start;
	}
	.cat :global(.trio-wide) {
		grid-column: 1 / -1;
	}
	/* pick-any chips */
	.cat :global(.pick) {
		height: 40px;
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
		.fields :global(.field) {
			gap: 6px;
		}
		.fields :global(.field > .label) {
			font-size: 13px;
		}
		.cat :global(legend) {
			margin-bottom: 6px;
		}
		.note,
		.fields .note {
			height: auto;
			min-height: 44px;
			padding: 10px 12px;
		}
		.note.long {
			min-height: 120px;
		}
		.cat :global(.trio) {
			grid-template-columns: minmax(0, 1fr) 120px 110px;
			gap: 12px;
		}
		.cat :global(.trio-wide) {
			grid-column: auto;
		}
	}
</style>
