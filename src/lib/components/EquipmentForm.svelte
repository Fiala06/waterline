<script lang="ts">
	// T3 · Add / edit equipment. Fields adapt to the type.
	import { enhance } from '$app/forms';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import { untrack } from 'svelte';
	import DayTimeline from '$lib/components/DayTimeline.svelte';
	import { DEFAULT_SERVICE, EQUIPMENT_TYPE_LABEL, EQUIPMENT_TYPES, hoursText, isCompletePeriod, MAX_PERIODS, RAMP_OPTIONS, SERVICE_CADENCES, SPEC_FIELDS, scheduleTotalHours, serviceVerb, specUnit, type EquipmentType } from '$lib/equipment';
	import type { UnitPrefs } from '$lib/units';

	let {
		mode,
		values,
		errors = {},
		brands = [],
		prefs,
		cancelHref,
		today,
		about = null
	}: {
		mode: 'new' | 'edit';
		values: {
			type: EquipmentType;
			brand: string;
			model: string;
			installedAt: string;
			notes: string;
			specs: Record<string, string>;
			/** the Service reminder: "off", a preset's days, or "custom" with serviceDays */
			serviceEvery: string;
			serviceDays: string;
			/** when it runs (#25): all day, or on a schedule of periods, with a ramp for lights */
			runs: string;
			periods: { on: string; off: string }[];
			rampMin: string;
		};
		errors?: Record<string, string>;
		brands?: { brand: string; tankName: string }[];
		prefs: UnitPrefs;
		cancelHref: string;
		/** YYYY-MM-DD in the user's time zone */
		today?: string;
		/** the detail page (edit): its kicker line, service history and linked task */
		about?: {
			kicker: string;
			serviced: string | null;
			history: { id: string; title: string; note: string | null; day: string }[];
			task: { id: string; name: string; line: string; due: { text: string; level: 'ok' | 'warn' | 'bad' } | null } | null;
		} | null;
	} = $props();
	const tankId = $derived(cancelHref.split('/')[2] ?? '');
	const serviceHref = $derived(`/entries/event/new?tank=${tankId}&category=maintenance&from=${encodeURIComponent(cancelHref)}`);

	let type = $state<EquipmentType>(untrack(() => values.type));
	let brand = $state(untrack(() => values.brand));
	let model = $state(untrack(() => values.model));
	let notes = $state(untrack(() => values.notes));
	let installedAt = $state(untrack(() => values.installedAt));
	const specs = $state<Record<string, string>>(untrack(() => ({ ...values.specs })));
	let busy = $state(false);
	let serviceEvery = $state(untrack(() => values.serviceEvery));
	let serviceDays = $state(untrack(() => values.serviceDays));
	// when it runs (#25)
	let runs = $state(untrack(() => values.runs));
	let periods = $state<{ on: string; off: string }[]>(untrack(() => (values.periods.length ? values.periods.map((p) => ({ ...p })) : [{ on: '08:00', off: '16:00' }])));
	let rampMin = $state(untrack(() => values.rampMin));
	const complete = $derived(periods.filter(isCompletePeriod));
	const preview = $derived(runs === 'schedule' && complete.length ? { periods: complete, rampMin: type === 'light' ? Number(rampMin) || null : null } : null);
	const previewHours = $derived(scheduleTotalHours(preview));
	// a new item's reminder follows its type (a filter monthly) until it's chosen by hand
	let serviceChosen = $state(false);
	$effect(() => {
		const d = DEFAULT_SERVICE[type] ?? 'off';
		if (mode === 'new' && !untrack(() => serviceChosen)) serviceEvery = d;
	});
	const fields = $derived(SPEC_FIELDS[type]);
	const brandMatches = $derived(
		brand.length >= 2 ? brands.filter((b) => b.brand.toLowerCase().startsWith(brand.toLowerCase()) && b.brand !== brand).slice(0, 3) : []
	);
</script>

<form
	method="POST"
	action="?/save"
	class="eqform"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<!-- phones; on desktop the header has the title -->
	<div class="bar hide-desk">
		<a class="cancel" href={cancelHref}>Cancel</a>
		<h1>{mode === 'edit' ? 'Edit equipment' : 'Add equipment'}</h1>
		<button class="save-top" disabled={busy}>Save</button>
	</div>

	{#if about}
		<div class="about-head hide-phone">
			<span class="kicker">{about.kicker}{about.serviced ? ` · last serviced ${about.serviced}` : ''}</span>
			<a class="btn btn-primary" href={serviceHref}>Log service</a>
		</div>
	{/if}
	<div class="cols" class:with-side={!!about}>
	<div class="body">
		<fieldset class="field">
			<legend class="label">Type</legend>
			<div class="chips">
				{#each EQUIPMENT_TYPES as t (t)}
					<label class="chip"><input type="radio" name="type" value={t} bind:group={type} />{EQUIPMENT_TYPE_LABEL[t]}</label>
				{/each}
			</div>
		</fieldset>

		<div class="brand">
			<div class="pair">
				<div class="field">
					<label class="label" for="eq-brand">Brand</label>
					<input class="input" id="eq-brand" name="brand" bind:value={brand} maxlength="60" autocomplete="off" aria-invalid={!!errors.brand} />
				</div>
				<div class="field">
					<label class="label" for="eq-model">Model</label>
					<input class="input" id="eq-model" name="model" bind:value={model} maxlength="60" autocomplete="off" />
				</div>
			</div>
			{#if brandMatches.length}
				<div class="suggest">
					{#each brandMatches as b (b.brand)}
						<button type="button" onclick={() => (brand = b.brand)}>
							<strong>{b.brand.slice(0, brand.length)}</strong>{b.brand.slice(brand.length)}<span class="muted">{' · used in ' + b.tankName}</span>
						</button>
					{/each}
				</div>
			{/if}
			{#if errors.brand}<span class="error-text">✕ {errors.brand}</span>{/if}
		</div>

		{#if fields.length}
			<!-- in pairs (Filter type + Flow rate); an odd one out takes the full width -->
			<div class="specs">
				{#each fields as f, i (`${type}.${f.key}`)}
					<div class="field" class:wide={i === fields.length - 1 && i % 2 === 0}>
						<label class="label" for="spec-{f.key}">{f.label}</label>
						{#if f.kind === 'select'}
							<select class="input" id="spec-{f.key}" name="spec.{f.key}" bind:value={specs[`${type}.${f.key}`]}>
								<option value="">—</option>
								{#each f.options ?? [] as o (o)}<option value={o}>{o}</option>{/each}
							</select>
						{:else if f.kind === 'number'}
							<div class="unit-input">
								<input id="spec-{f.key}" name="spec.{f.key}" inputmode="decimal" bind:value={specs[`${type}.${f.key}`]} />
								<span class="unit">{specUnit(f, prefs)}</span>
							</div>
						{:else}
							<input class="input" id="spec-{f.key}" name="spec.{f.key}" bind:value={specs[`${type}.${f.key}`]} maxlength="80" placeholder={f.placeholder} />
						{/if}
						{#if errors[`spec.${f.key}`]}<span class="error-text">✕ {errors[`spec.${f.key}`]}</span>{/if}
					</div>
				{/each}
			</div>
		{/if}

		<div class="field">
			<label class="label" for="eq-installed">Installed</label>
			<DateField name="installedAt" id="eq-installed" bind:value={installedAt} label="Installed" {today} max={today} invalid={!!errors.installedAt} />
			{#if errors.installedAt}<span class="error-text">✕ {errors.installedAt}</span>{/if}
		</div>
		<div class="field">
			<label class="label" for="eq-notes">Notes</label>
			<textarea class="input" id="eq-notes" name="notes" rows="2" maxlength="2000" placeholder="Media, settings, where you bought it" bind:value={notes}></textarea>
		</div>

		<!-- when it runs (#25): all day, or periods in the day; lights can ramp -->
		<fieldset class="field runs">
			<legend class="label">Runs</legend>
			<div class="segmented">
				<label><input type="radio" name="runs" value="always" bind:group={runs} />All day</label>
				<label><input type="radio" name="runs" value="schedule" bind:group={runs} />On a schedule</label>
			</div>
			{#if runs === 'schedule'}
				<div class="periods">
					{#each periods as p, i (i)}
						<div class="period">
							<input class="input" type="time" name="periodOn" aria-label="Period {i + 1} on" bind:value={p.on} aria-invalid={!!errors.periods} />
							<span class="dash" aria-hidden="true">–</span>
							<input class="input" type="time" name="periodOff" aria-label="Period {i + 1} off" bind:value={p.off} aria-invalid={!!errors.periods} />
							{#if periods.length > 1}
								<button type="button" class="btn-icon x" aria-label="Remove period {i + 1}" onclick={() => (periods = periods.filter((_, j) => j !== i))}>✕</button>
							{/if}
						</div>
					{/each}
					{#if periods.length < MAX_PERIODS}
						<button type="button" class="btn-text add-period" onclick={() => (periods = [...periods, { on: '', off: '' }])}>+ Add a period{periods.length === 1 ? ' · a midday siesta, or a second run' : ''}</button>
					{/if}
				</div>
				{#if type === 'light'}
					<div class="ramp-row">
						<label class="label" for="eq-ramp">Ramp up and down</label>
						<select class="input" id="eq-ramp" name="rampMin" bind:value={rampMin}>
							{#each RAMP_OPTIONS as r (r)}<option value={String(r)}>{r === 0 ? 'None' : `${r} min`}</option>{/each}
						</select>
					</div>
				{/if}
				{#if errors.periods}<span class="error-text">✕ {errors.periods}</span>{/if}
				{#if preview}
					<div class="preview">
						<DayTimeline rows={[{ label: previewHours != null ? hoursText(previewHours) : '', schedule: preview }]} compact />
						<span class="hint">{type === 'light' ? `Photoperiod ${previewHours != null ? hoursText(previewHours) : '—'} a day; the tank's photoperiod follows it.` : `Runs ${previewHours != null ? hoursText(previewHours) : '—'} a day.`} Changes are kept in History.</span>
					</div>
				{/if}
			{:else}
				<span class="hint">{type === 'light' || type === 'co2' ? 'A timer? Set its periods here and the tank’s lights and CO₂ times follow.' : 'On a timer? Set its periods here.'}</span>
			{/if}
		</fieldset>

		<!-- the service reminder: a maintenance task for this item, kept in step by Save -->
		<div class="field service">
			<label class="label" for="eq-service">Service reminder</label>
			<div class="service-row">
				<select class="input" id="eq-service" name="serviceEvery" bind:value={serviceEvery} onchange={() => (serviceChosen = true)}>
					{#each SERVICE_CADENCES as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
				</select>
				{#if serviceEvery === 'custom'}
					<div class="unit-input days">
						<input name="serviceDays" inputmode="numeric" bind:value={serviceDays} aria-label="Service every (days)" placeholder="28" aria-invalid={!!errors.serviceDays} />
						<span class="unit">days</span>
					</div>
				{/if}
			</div>
			{#if errors.serviceDays}<span class="error-text">✕ {errors.serviceDays}</span>{/if}
			<span class="hint">
				{#if serviceEvery === 'off'}No reminder. Log service still records the date.{:else}A task, “{serviceVerb(type)} {[brand, model].filter(Boolean).join(' ') || EQUIPMENT_TYPE_LABEL[type]}”, due again that long after each service you log.{/if}
			</span>
		</div>
		<p class="hint">Fields adapt to type: heaters get wattage, lights get photoperiod.</p>
	</div>
	{#if about}
		<aside class="side">
			{#if about.task}
				<div class="block">
					<span class="kicker">Linked task</span>
					<span class="task-name">{about.task.name}</span>
					{#if about.task.due}<span class="task-due status-{about.task.due.level}">{about.task.due.text}</span>{/if}
					<span class="task-line">{about.task.line}</span>
					<a class="ghost" href="/tasks?edit={about.task.id}">Open in Tasks ›</a>
				</div>
			{/if}
			<div class="log">
				<span class="kicker rule">Service history · {about.history.length}</span>
				{#each about.history as h (h.id)}
					<a class="log-row" href="/entries/event/{h.id}">
						<span class="log-top"><b>{h.title}</b><span class="log-day">{h.day}</span></span>
						{#if h.note}<span class="log-note">{h.note}</span>{/if}
					</a>
				{/each}
				{#if !about.history.length}<span class="none">No service logged yet.</span>{/if}
				<a class="ghost hide-desk" href={serviceHref}>Log service</a>
			</div>
		</aside>
	{/if}
	</div>

	<div class="foot">
		{#if mode === 'edit'}
			<button type="button" class="btn btn-danger remove" popovertarget="confirm-eq-remove">Remove</button>
		{/if}
		<a class="btn hide-phone" href={cancelHref}>Cancel</a>
		<button class="btn btn-primary save" disabled={busy}>Save</button>
	</div>
</form>

{#if mode === 'edit'}
	<ConfirmDelete
		id="confirm-eq-remove"
		trigger={false}
		title="Remove this equipment?"
		body={'It moves to past equipment and a "Removed" entry is added to History. A reminder made for it is removed too.'}
		action="?/remove"
		label="Remove"
	/>
{/if}

<style>
	.eqform {
		max-width: 560px;
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
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
		font-weight: 800;
	}
	.save-top {
		justify-self: end;
		color: var(--accent-text);
		font-weight: 800;
		font-size: 16px;
		min-height: 44px;
	}
	.about-head {
		display: none;
	}
	.cols {
		display: flex;
		flex-direction: column;
		gap: 20px;
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
	.brand {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.pair,
	.specs {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 18px 12px;
	}
	.wide {
		grid-column: 1 / -1;
	}
	/* T3: brands used in other tanks, under both fields */
	.suggest {
		border: 1px solid var(--divider);
		display: flex;
		flex-direction: column;
	}
	.suggest button {
		min-height: 44px;
		padding: 10px 14px;
		text-align: left;
		font-size: 14px;
	}
	.suggest button + button {
		border-top: 1px solid var(--divider);
	}
	/* when it runs (#25) */
	.runs .segmented {
		max-width: 320px;
	}
	.periods {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 6px;
	}
	.period {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.period .input {
		width: auto;
		min-width: 0;
		flex: 1;
		max-width: 150px;
		min-height: 44px;
	}
	.dash {
		color: var(--text-muted);
	}
	.period .x {
		width: 44px;
		height: 44px;
		color: var(--text-muted);
	}
	.add-period {
		align-self: flex-start;
		min-height: 36px;
		padding: 0;
		font-size: 14px;
	}
	.ramp-row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 8px;
	}
	.ramp-row .input {
		width: auto;
		min-height: 44px;
	}
	.preview {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 10px;
		padding-top: 8px;
		border-top: 1px solid var(--divider);
	}
	.service-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 10px;
	}
	.service-row .input {
		min-width: 0;
	}
	.days {
		width: 120px;
	}
	.service .hint {
		margin-top: 6px;
	}
	.task-due {
		font-size: 13px;
		font-weight: 800;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.ghost {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 4px;
		font-size: 14px;
		font-weight: 800;
		color: var(--accent-text);
	}
	/* the detail page's column: linked task, service history */
	.side {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding: 0 20px;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: 10px;
		border-top: 2px solid var(--ink);
	}
	.task-name {
		font-size: 16px;
		font-weight: 800;
	}
	.task-line {
		font-size: 13px;
		color: var(--text-2);
	}
	.log {
		display: flex;
		flex-direction: column;
	}
	.rule {
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
	}
	.log-row {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 9px 0;
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
		color: var(--text);
	}
	.log-top {
		display: flex;
		justify-content: space-between;
		gap: 10px;
	}
	.log-top b {
		font-weight: 600;
	}
	.log-day {
		color: var(--text-muted);
		white-space: nowrap;
	}
	.log-note {
		font-size: 13px;
		color: var(--text-2);
	}
	.none {
		padding: 10px 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	.foot {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		gap: 10px;
	}
	.foot .btn {
		height: 52px;
		font-size: 16px;
	}
	.save {
		flex: 1;
	}
	@media (hover: hover) {
		.suggest button:hover {
			background: var(--surface);
		}
		.ghost:hover {
			background: color-mix(in srgb, var(--accent) 10%, transparent);
		}
		.log-row:hover b {
			color: var(--accent-text);
		}
	}
	/* Desktop: a flat form under the shell's title; the detail page gets a 300px column */
	@media (min-width: 1024px) {
		.eqform {
			min-height: 0;
			max-width: 640px;
			padding: 24px 32px 40px;
		}
		.eqform:has(.with-side) {
			max-width: 1040px;
		}
		.about-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 16px;
			padding-bottom: 14px;
			margin-bottom: 20px;
			border-bottom: 2px solid var(--divider);
		}
		.cols.with-side {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 300px;
			gap: 32px;
			align-items: start;
		}
		.body,
		.side {
			padding: 0;
		}
		.foot {
			margin-top: 20px;
			padding: 16px 0 0;
			border-top: 2px solid var(--divider);
			justify-content: flex-start;
			gap: 12px;
		}
		.foot .btn {
			height: 44px;
			font-size: 14px;
		}
		.foot .hide-phone {
			order: 2;
			border: none;
			color: var(--text-muted);
		}
		.remove {
			order: 3;
			margin-left: auto;
		}
		.save {
			order: 1;
			flex: none;
			padding: 0 22px;
		}
	}
</style>
