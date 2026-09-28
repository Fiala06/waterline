<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	// 14 / G2–G5 / D13 · Log event: one layout that adapts to the category.
	import { enhance } from '$app/forms';
	import { queueable } from '$lib/offline';
	import { hscroll } from '$lib/actions';
	import { clearDraft, logDraft, type Restored } from '$lib/draft';
	import ConfirmDelete from './ConfirmDelete.svelte';
	import { ui } from '$lib/ui.svelte';
	import DateTimePicker from './DateTimePicker.svelte';
	import PhotoPicker from './PhotoPicker.svelte';
	import SpeciesInput from './SpeciesInput.svelte';
	import WaterChangeFields from './WaterChangeFields.svelte';
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
		RECHECK_OPTIONS
	} from '$lib/events';
	import { FEED_UNITS } from '$lib/tasks';
	import { whenLabel, type When } from '$lib/time';
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
		recentProducts = [],
		productLinks = [],
		error = null,
		errors = {},
		meta = null,
		existingPhotos = [],
		remove = null,
		inventory = null,
		water = null,
		ontankclick,
		draftKey = null
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
		task?: { id: string; label: string; checked: boolean } | null;
		recentProducts?: { product: string; amount: unknown; unit: unknown; at: string }[];
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

	// Livestock / plants (G3): new entries add to or take from the tank's lists.
	let lsAction = $state(untrack(() => v('action') || 'added'));
	let lsKind = $state<'fish' | 'invert' | 'coral' | 'plant'>('fish');
	let lsTarget = $state('');
	let lsStatus = $state(untrack(() => v('status') || 'in_tank'));
	let count = $state(untrack(() => v('count') || (mode === 'new' ? '1' : '')));
	let species = $state({ name: '', scientific: '' });
	let speciesBox: HTMLElement | undefined = $state();
	let eqId = $state(untrack(() => inventory?.equipment[0]?.id ?? ''));
	let eqAction = $state(untrack(() => v('action') || 'adjusted'));
	const linked = $derived(mode === 'new' && !!inventory);
	const targetIsLivestock = $derived(lsTarget.startsWith('livestock:'));
	const targetAnimal = $derived(
		targetIsLivestock ? inventory?.livestock.find((l) => l.id === lsTarget.slice('livestock:'.length)) : undefined
	);

	let when = $state<When | null>(untrack(() => initialWhen));
	let picking = $state(false);
	let clientId = $state('');
	let busy = $state(false);
	onMount(() => (clientId = crypto.randomUUID()));

	// An entry that was left before it was saved comes back, with Discard.
	let restored = $state<{ discard: () => Promise<void> } | null>(null);
	function onrestore(r: Restored) {
		if (r.date && r.time) when = { date: r.date, time: r.time };
		restored = {
			discard: async () => {
				restored = null;
				when = initialWhen;
				await r.discard();
			}
		};
	}

	// Water change
	let amountMode = $state(v('amountMode') || 'percent');
	let amount = $state(untrack(() => v('amount') || (mode === 'new' ? '25' : '')));

	let note = $state(untrack(() => initialNote));
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
	const fmtDose = (r: (typeof recentProducts)[number]) =>
		`Last dosed ${r.amount ?? ''} ${r.unit ?? ''} on ${new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone })}.`.replace(/\s+/g, ' ');
	const savedLink = $derived(productLinks.find((l) => l.name.trim().toLowerCase() === product.trim().toLowerCase()));
	const doseHint = $derived(
		[lastDose ? fmtDose(lastDose) : '', recentProducts.length ? 'Recent products are listed first.' : ''].filter(Boolean).join(' ')
	);

	// − 10 + (G3). Adding starts at 1; taking away can't go past what's in the tank.
	const countMin = $derived(linked ? 1 : 0);
	const countMax = $derived(linked && lsAction === 'removed' ? (targetAnimal?.count ?? null) : null);
	const countN = $derived(parseInt(count, 10));
	function step(d: number) {
		let n = (Number.isNaN(countN) ? (d > 0 ? countMin - 1 : countMin + 1) : countN) + d;
		n = Math.max(countMin, n);
		if (countMax != null) n = Math.min(countMax, n);
		count = String(n);
	}

	// The species field is its own component: read what it holds after each change.
	function readSpecies() {
		setTimeout(() => {
			const box = speciesBox;
			if (!box) return;
			const name = box.querySelector<HTMLInputElement>('input[name="name"]')?.value.trim() ?? '';
			const scientific = box.querySelector<HTMLInputElement>('input[name="scientificName"]')?.value ?? '';
			species = { name, scientific };
		});
	}
	$effect(() => {
		void lsKind;
		void lsAction;
		tick().then(readSpecies);
	});

	// G3: "Livestock tab: Ember tetra 0 → 10 · 41 animals total"
	const preview = $derived.by(() => {
		if (!linked || !inventory) return null;
		const n = parseInt(count, 10);
		if (!(n > 0)) return null;
		const total = inventory.livestock.reduce((s, l) => s + l.count, 0);
		if (lsAction === 'added' && lsKind !== 'plant' && species.name) {
			// the same species with the same status adds to that row (addLivestock)
			const same = inventory.livestock.find(
				(l) =>
					(l.status ?? 'in_tank') === lsStatus &&
					(species.scientific && l.scientific ? l.scientific === species.scientific : l.name.toLowerCase() === species.name.toLowerCase())
			);
			const from = same?.count ?? 0;
			return { name: same?.name ?? species.name, from, to: from + n, total: total + n };
		}
		if (lsAction === 'removed' && targetAnimal && n <= targetAnimal.count) {
			return { name: targetAnimal.name, from: targetAnimal.count, to: targetAnimal.count - n, total: total - n };
		}
		return null;
	});

	const taskText = $derived.by(() => {
		if (!task) return null;
		const m = task.label.match(/^(.*?)\s*(\(next due [^)]*\))$/);
		return m ? { main: m[1], next: m[2] } : { main: task.label, next: '' };
	});

	const saveLabel = $derived(
		mode === 'edit'
			? 'Save changes'
			: {
					water_change: 'Save water change',
					dosing: 'Save dosing',
					feeding: 'Save feeding',
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

<form
	method="POST"
	enctype="multipart/form-data"
	class="eform"
	class:edit={mode === 'edit'}
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
		busy: (b) => (busy = b),
		onsaved: () => draftKey && clearDraft(draftKey)
	})}
	use:logDraft={{ key: mode === 'new' ? draftKey : null, onrestore, watch: when }}
>
	<input type="hidden" name="clientId" value={clientId} />
	{#if returnTo}<input type="hidden" name="from" value={returnTo} />{/if}
	<input type="hidden" name="date" value={when?.date ?? ''} />
	<input type="hidden" name="time" value={when?.time ?? ''} />

	<div class="panel">
		<!-- phone: 14 / G2–G5 top bar (G6 in edit mode) -->
		<header class="bar hide-desk">
			{#if mode === 'edit'}
				<a class="bar-text" href={closeHref}>Cancel</a>
			{:else}
				<a class="btn-icon close" href={closeHref} aria-label="Close">✕</a>
			{/if}
			<div class="title">
				<h1>{title}</h1>
				<button type="button" class="sub" onclick={() => (picking = true)}
					>{mode === 'edit' ? whenLabel(when) : `${tankName} · ${whenLabel(when)}`} ▾</button
				>
			</div>
			{#if mode === 'edit'}
				<button class="bar-text bar-save" disabled={busy}>Save</button>
			{:else}
				<span class="spacer" aria-hidden="true"></span>
			{/if}
		</header>

		<!-- desktop: D13 header -->
		<header class="dhead hide-phone">
			<h1>{title}</h1>
			<button type="button" class="chip chip-pill" onclick={() => ontankclick?.()} disabled={!ontankclick}
				>{tankName} <span class="caret">▾</span></button
			>
			<button type="button" class="chip chip-pill when" onclick={() => (picking = true)}
				>{whenLabel(when)} <span class="caret">▾</span></button
			>
			<a class="btn-icon x" href={closeHref} aria-label="Close">✕</a>
		</header>

		<div class="body">
			{#if meta}<p class="meta">{meta}</p>{/if}

			{#if mode === 'new' && categoryHref && category !== 'note'}
				<!-- phones show the chosen category first; desktop keeps the order (D13) -->
				<nav class="cats hscroll" aria-label="Category" use:hscroll={category}>
					{#each LOG_CATEGORIES as c (c)}
						<a class="chip" class:selected={c === category} aria-current={c === category ? 'page' : undefined} href={categoryHref(c)}
							>{CATEGORY_LABEL[c]}</a
						>
					{/each}
				</nav>
			{/if}

			{#if error}<p class="banner banner-bad" role="alert">✕ {error}</p>{/if}
			{#if restored}
				<div class="draft-note" role="status">
					<span>▲ Restored what you hadn't saved</span>
					<button type="button" class="btn-text" onclick={() => restored?.discard()}>Discard</button>
				</div>
			{/if}

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
					/>
				{:else if category === 'dosing'}
					<div class="dose">
						<div class="field product">
							<label class="label" for="product">Product</label>
							<input class="input" id="product" name="product" bind:value={product} list="recent-products" maxlength="80" autocomplete="off" placeholder="e.g. All-in-one fertilizer" aria-invalid={!!errors.product} />
							<datalist id="recent-products">
								{#each recentProducts as r (r.product)}<option value={r.product}></option>{/each}
							</datalist>
							{#if recentProducts.length && !product}
								<div class="chips">
									{#each recentProducts as r (r.product)}
										<button type="button" class="chip" onclick={() => pickProduct(r)}>{r.product}</button>
									{/each}
								</div>
							{/if}
							{#if errors.product}<span class="error-text">✕ {errors.product}</span>{/if}
						</div>
						<div class="field">
							<label class="label" for="amount">Amount</label>
							<input class="input" id="amount" name="amount" inputmode="decimal" autocomplete="off" defaultValue={v('amount')} aria-invalid={!!errors.amount} />
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
					{#if mode === 'new' && savedLink}
						<a class="reorder" href={savedLink.url} target="_blank" rel="noopener noreferrer"
							>Reorder {savedLink.name}<span aria-hidden="true"> ↗</span><span class="sr-only"> (opens in a new tab)</span></a
						>
					{:else if mode === 'new' && lastDose}
						<!-- a product dosed before is one worth a link -->
						<a class="reorder" href="/settings/products?name={encodeURIComponent(product.trim())}#add">Save a reorder link</a>
					{/if}
				{:else if category === 'feeding'}
					<!-- logged by a feeding routine's Done (#17), edited here -->
					<div class="dose">
						<div class="field product">
							<label class="label" for="food">Food</label>
							<input class="input" id="food" name="food" defaultValue={v('food')} maxlength="80" autocomplete="off" placeholder="e.g. Micro pellets" aria-invalid={!!errors.food} />
							{#if errors.food}<span class="error-text">✕ {errors.food}</span>{/if}
						</div>
						<div class="field">
							<label class="label" for="amount">Amount</label>
							<input class="input" id="amount" name="amount" inputmode="decimal" autocomplete="off" defaultValue={v('amount')} aria-invalid={!!errors.amount} />
							{#if errors.amount}<span class="error-text">✕ {errors.amount}</span>{/if}
						</div>
						<div class="field">
							<label class="label" for="unit">Unit</label>
							<select class="input" id="unit" name="unit" value={v('unit')}>
								<option value="">—</option>
								{#each FEED_UNITS as u (u)}<option value={u}>{u}</option>{/each}
							</select>
						</div>
					</div>
				{:else if category === 'maintenance'}
					<fieldset class="field">
						<legend class="label">What did you do?</legend>
						<div class="chips">
							{#each MAINTENANCE_ACTIONS as a (a)}
								<label class="chip pick"><input type="checkbox" name="actions" value={a} defaultChecked={list('actions').includes(a)} />{a}</label>
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
					<fieldset class="seg-field">
						<legend class="sr-only">Change</legend>
						<div class="segmented">
							{#each LIVESTOCK_ACTIONS as a (a.value)}
								<label><input type="radio" name="action" value={a.value} bind:group={lsAction} onchange={() => (count = '1')} />{a.label}</label>
							{/each}
						</div>
					</fieldset>
					{#if lsAction === 'added'}
						<div class="segmented" role="group" aria-label="Kind">
							{#each [['fish', 'Fish'], ['invert', 'Invert'], ['coral', 'Coral'], ['plant', 'Plant']] as [k, l] (k)}
								<label><input type="radio" name="kind" value={k} bind:group={lsKind} />{l}</label>
							{/each}
						</div>
						<div class="species" bind:this={speciesBox} oninput={readSpecies} onclick={readSpecies} onkeyup={readSpecies} onfocusout={readSpecies} role="presentation">
							{#key lsKind}<SpeciesInput kind={lsKind} water={lsKind === 'plant' ? 'fresh' : water} invalid={!!errors.name} />{/key}
						</div>
						{#if errors.name}<span class="error-text">✕ {errors.name}</span>{/if}
						{#if lsKind === 'plant'}
							<div class="field">
								<label class="label" for="position">Position</label>
								<select class="input" id="position" name="position">
									<option value="background">Background</option>
									<option value="midground" selected>Midground</option>
									<option value="foreground">Foreground</option>
									<option value="epiphyte">Epiphyte</option>
									<option value="floating">Floating</option>
								</select>
							</div>
						{:else}
							<div class="pair">
								<div class="field">
									<label class="label" for="count">Count</label>
									<div class="count-stepper stepper">
										<button type="button" aria-label="One fewer" disabled={!Number.isNaN(countN) && countN <= countMin} onclick={() => step(-1)}>−</button>
										<input id="count" name="count" inputmode="numeric" autocomplete="off" bind:value={count} aria-invalid={!!errors.count} />
										<button type="button" aria-label="One more" onclick={() => step(1)}>+</button>
									</div>
									{#if errors.count}<span class="error-text">✕ {errors.count}</span>{/if}
								</div>
								<div class="field">
									<label class="label" for="status">Status</label>
									<select class="input" id="status" name="status" bind:value={lsStatus}>
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
									<div class="count-stepper stepper">
										<button type="button" aria-label="One fewer" disabled={!Number.isNaN(countN) && countN <= countMin} onclick={() => step(-1)}>−</button>
										<input id="count" name="count" inputmode="numeric" autocomplete="off" bind:value={count} aria-invalid={!!errors.count} />
										<button type="button" aria-label="One more" disabled={countMax != null && !Number.isNaN(countN) && countN >= countMax} onclick={() => step(1)}>+</button>
									</div>
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
					<fieldset class="seg-field">
						<legend class="sr-only">Change</legend>
						<div class="segmented">
							{#each LIVESTOCK_ACTIONS as a (a.value)}
								<label><input type="radio" name="action" value={a.value} defaultChecked={(v('action') || 'added') === a.value} />{a.label}</label>
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
							<div class="count-stepper stepper">
								<button type="button" aria-label="One fewer" disabled={!Number.isNaN(countN) && countN <= countMin} onclick={() => step(-1)}>−</button>
								<input id="count" name="count" inputmode="numeric" autocomplete="off" bind:value={count} aria-invalid={!!errors.count} />
								<button type="button" aria-label="One more" onclick={() => step(1)}>+</button>
							</div>
							{#if errors.count}<span class="error-text">✕ {errors.count}</span>{/if}
						</div>
						<div class="field">
							<label class="label" for="status">Status</label>
							<select class="input" id="status" name="status" bind:value={lsStatus}>
								{#each LIVESTOCK_STATUS as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
							</select>
						</div>
					</div>
				{:else if category === 'equipment'}
					<fieldset class="seg-field">
						<legend class="sr-only">Change</legend>
						<div class="segmented">
							{#each EQUIPMENT_ACTIONS as a (a.value)}
								<label><input type="radio" name="action" value={a.value} bind:group={eqAction} />{a.label}</label>
							{/each}
						</div>
						{#if errors.action}<span class="error-text">✕ {errors.action}</span>{/if}
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
						<div class="chips">
							{#each EQUIPMENT_REASONS as r (r)}
								<label class="chip pick"><input type="checkbox" name="reasons" value={r} defaultChecked={list('reasons').includes(r)} />{r}</label>
							{/each}
						</div>
					</fieldset>
				{:else if category === 'observation'}
					<fieldset class="field">
						<legend class="label">What did you notice?</legend>
						<div class="chips">
							{#each OBSERVATION_TAGS as t (t)}
								<label class="chip pick"><input type="checkbox" name="tags" value={t} defaultChecked={list('tags').includes(t)} />{t}</label>
							{/each}
						</div>
						{#if errors.tags}<span class="error-text">✕ {errors.tags}</span>{/if}
					</fieldset>
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

				<PhotoPicker existing={existingPhotos} />

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

				{#if task && taskText}
					<label class="check-row task">
						<input type="checkbox" name="completeTask" value={task.id} defaultChecked={task.checked} />
						<span class="task-text"
							><span>{taskText.main}</span>{#if taskText.next}{' '}<span class="next">{taskText.next}</span>{/if}</span
						>
					</label>
				{/if}
			</div>
		</div>

		<footer class="foot">
			<span class="grow" aria-hidden="true"></span>
			<a class="btn cancel" href={closeHref}>Cancel</a>
			<button class="btn btn-primary save" disabled={busy}>{saveLabel}</button>
			{#if remove}<button type="button" class="remove" popovertarget="confirm-entry-delete">Delete entry</button>{/if}
		</footer>
	</div>
</form>

{#if remove}
	<ConfirmDelete id="confirm-entry-delete" trigger={false} title={remove.title} body={remove.body} action={remove.action} fields={{ from: ui.prev ?? '' }} />
{/if}

<DateTimePicker bind:open={picking} value={when} {timeZone} onselect={(w) => (when = w)} />

<style>
	/* a field scrolled or tabbed to stays clear of the sticky Save bar */
	:global(html:has(.eform)) {
		scroll-padding-bottom: 112px;
	}
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

	/* ── Phone top bar ── */
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 0;
	}
	.close {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.bar-text {
		min-width: 60px;
		min-height: 44px;
		display: flex;
		align-items: center;
		flex-shrink: 0;
		font-size: 16px;
		color: var(--text-muted);
	}
	.bar-save {
		justify-content: flex-end;
		color: var(--accent);
		font-weight: 700;
	}
	.bar-save:disabled {
		opacity: 0.45;
	}
	.title {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		min-width: 0;
		text-align: center;
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	/* a 36px box (44px to tap) that takes the title's 24px */
	.sub {
		position: relative;
		font-size: 12px;
		color: var(--text-muted);
		min-height: 36px;
		margin: -6px 0;
	}
	.sub::after {
		content: '';
		position: absolute;
		inset: -4px -8px;
	}
	.spacer {
		width: 44px;
		flex-shrink: 0;
	}
	.dhead {
		display: flex;
	}

	.body {
		display: flex;
		flex-direction: column;
		padding-bottom: 20px;
	}
	.meta {
		margin: 0 0 16px;
		padding: 10px 14px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		font-size: 13px;
		color: var(--text-muted);
	}

	/* ── Category chips (14, G2–G5) ── */
	.cats {
		margin-inline: -20px;
		padding-inline: 20px;
		margin-bottom: 16px;
	}
	.cats .chip {
		height: 40px;
		border-radius: 20px;
		color: var(--text);
	}
	.cats .chip.selected {
		color: var(--on-accent);
	}
	@media (max-width: 1023px) {
		.cats .chip.selected {
			order: -1;
		}
	}
	.banner,
	.draft-note {
		margin: 0 0 16px;
	}
	.fields {
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
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
	}
	/* "Reorder Seachem Prime ↗" under the dosing fields */
	.reorder {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin: -12px 0 -8px;
		font-size: 14px;
		font-weight: 600;
		color: var(--accent);
	}

	/* ── Dosing: product, amount, unit (D13 puts them in one row) ── */
	.dose {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px 12px;
		align-items: start;
	}
	.product {
		grid-column: 1 / -1;
	}

	/* ── Pick-any chips (G2, G4, G5) ── */
	.pick {
		height: 40px;
		border-radius: 12px;
	}

	/* ── Segmented choices (G3, G4) ── */
	.segmented label {
		min-height: 40px;
		font-size: 14px;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.stepper {
		display: flex;
		width: 100%;
		height: 52px;
		background: var(--surface);
		border-color: var(--border);
	}
	.stepper button {
		width: 48px;
		flex-shrink: 0;
		font-size: 22px;
		color: var(--text-2);
	}
	.stepper button:disabled {
		color: var(--placeholder);
	}
	.stepper input {
		flex: 1;
		align-self: stretch; /* the whole middle is the tap target */
		width: auto;
		min-width: 0;
		font-size: 18px;
		font-weight: 700;
	}
	.preview {
		margin: 0;
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--border);
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
		min-height: 52px;
		padding-top: 13px;
		padding-bottom: 13px;
		font-size: 16px;
		background: transparent;
		border-color: var(--border-strong);
		resize: none;
		overflow-y: hidden;
	}
	.note.long {
		min-height: 140px;
	}
	.note:focus {
		box-shadow: inset 0 0 0 1px var(--accent);
	}

	/* ── G5 "Remind me to check again" ── */
	.remind {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 48px;
		padding: 2px 6px 2px 14px;
		border-radius: 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		font-size: 14px;
	}
	.remind-pick {
		position: relative;
		display: flex;
		align-items: center;
		color: var(--accent);
	}
	.remind select {
		appearance: none;
		-webkit-appearance: none;
		min-height: 44px;
		padding: 0 26px 0 8px;
		border: none;
		border-radius: 10px;
		background: transparent;
		color: var(--accent);
		font-size: 14px;
		font-weight: 600;
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

	/* ── Task ── */
	.task {
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		font-size: 14px;
		line-height: 1.4;
	}
	.next {
		display: block;
	}

	/* ── Footer: sticky Save (14); G6 puts Save changes and Delete entry at the end ── */
	.foot {
		position: sticky;
		bottom: 0;
		z-index: 2;
		margin: auto -20px 0;
		padding: 14px 20px calc(28px + env(safe-area-inset-bottom));
		background: var(--bg);
		border-top: 1px solid var(--divider-soft);
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.grow,
	.cancel {
		display: none;
	}
	.save {
		flex: 1;
		height: 56px;
		border-radius: 14px;
		font-size: 17px;
	}
	.edit .foot {
		position: static;
		flex-direction: column;
		align-items: stretch;
		gap: 10px;
		border-top: none;
		background: transparent;
	}
	.edit .save {
		flex: none;
		height: 52px;
	}
	.remove {
		min-height: 44px;
		font-size: 15px;
		font-weight: 600;
		color: var(--bad);
	}

	@media (min-width: 1024px) {
		.eform {
			min-height: 0;
			padding: 28px 32px;
			align-items: center;
		}
		.panel {
			width: 600px;
			max-width: 100%;
			flex: none;
			padding: 0;
			border-radius: 20px;
			background: var(--surface);
			border: 1px solid var(--border-strong);
			box-shadow: var(--shadow-modal);
			/* rounds the sticky footer's corners without making the card a scroller */
			overflow: clip;
		}
		.dhead {
			align-items: center;
			gap: 10px;
			padding: 20px 24px;
			border-bottom: 1px solid var(--border);
		}
		.dhead h1 {
			flex: 1;
			min-width: 0;
			font-size: 22px;
		}
		.dhead .chip {
			height: 36px;
			padding: 0 12px;
		}
		.when {
			font-weight: 400;
		}
		.x {
			display: flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			background: transparent;
		}
		.body {
			padding: 20px 24px;
		}
		.cats {
			flex-wrap: wrap;
			overflow: visible;
			margin: 0 0 18px;
			padding: 0;
		}
		.cats .chip {
			height: 36px;
			border-radius: 18px;
		}
		/* D13: 13px labels, 48px fields on the card (the species field included) */
		.fields :global(.field) {
			gap: 6px;
		}
		.fields :global(.field > .label) {
			font-size: 13px;
		}
		legend {
			margin-bottom: 6px;
		}
		.fields :global(.input) {
			height: 48px;
			font-size: 15px;
			padding: 0 14px;
			background-color: var(--surface-2);
			border-color: var(--border-strong);
		}
		.fields :global(select.input) {
			padding-right: 40px;
		}
		.fields :global(.input:focus) {
			border-color: var(--accent);
		}
		.note,
		.fields .note {
			height: auto;
			min-height: 48px;
			padding: 12px 14px;
			background-color: transparent;
		}
		.note.long {
			min-height: 120px;
		}
		.dose {
			grid-template-columns: minmax(0, 1fr) 120px 110px;
			gap: 12px;
		}
		.product {
			grid-column: auto;
		}
		.stepper {
			background: var(--surface-2);
			border-color: var(--border-strong);
		}
		.stepper {
			height: 48px;
		}
		.remind,
		.task {
			background: var(--surface-2);
		}
		.foot,
		.edit .foot {
			position: sticky;
			bottom: 0;
			margin: 0;
			padding: 16px 24px 20px;
			flex-direction: row;
			align-items: center;
			gap: 10px;
			border-top: 1px solid var(--border);
			background: var(--surface);
		}
		.grow {
			display: block;
			flex: 1;
		}
		.cancel {
			display: inline-flex;
			font-weight: 400;
			padding: 0 18px;
		}
		.save,
		.edit .save {
			flex: none;
			height: 44px;
			border-radius: 12px;
			font-size: 15px;
			padding: 0 22px;
		}
		.remove {
			order: -1;
			height: 44px;
			padding: 0 16px;
			border-radius: 12px;
			border: 1px solid var(--bad-border);
		}
	}
	@media (min-width: 1024px) and (hover: hover) {
		.remove:hover {
			background: var(--bad-bg);
		}
	}
</style>
