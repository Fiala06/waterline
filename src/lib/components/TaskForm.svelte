<script lang="ts">
	// 15 / D5 · Create or edit a task. Phones get the full-screen form (15), desktop a
	// centered card; `compact` is the docked edit pane on the Tasks page (D5). A
	// routine (#17) is a task that doses a product or feeds a food: marking it done
	// logs that in History.
	import { applyAction, enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import { untrack } from 'svelte';
	import { DOSING_UNITS } from '$lib/events';
	import { FEED_UNITS, scheduleExamples, WEEKDAYS } from '$lib/tasks';
	import { parseNumber } from '$lib/units';

	interface Values {
		type: 'task' | 'dosing' | 'feeding';
		name: string;
		tankId: string;
		recurring: boolean;
		repeat: 'every' | 'days' | 'no';
		every: string;
		unit: 'days' | 'weeks';
		weekdays: number[];
		nextDue: string;
		scheduleMode: 'completion' | 'fixed';
		onDone: 'none' | 'test' | 'water_change';
		product: string;
		amount: string;
		amountUnit: string;
	}
	let {
		mode,
		tanks,
		values,
		errors = {},
		action = '',
		cancelHref,
		compact = false,
		afterSave,
		today,
		products = [],
		from = null
	}: {
		mode: 'new' | 'edit';
		tanks: { id: string; name: string }[];
		values: Values;
		errors?: Record<string, string>;
		action?: string;
		cancelHref: string;
		compact?: boolean;
		/** Where to go after a save instead of the server's redirect (the pane stays on its task). */
		afterSave?: string;
		/** YYYY-MM-DD in the user's time zone, for the date picker */
		today?: string;
		/** a dosing routine's product: saved reorder links and ones dosed before */
		products?: string[];
		/** a tank's page a new routine was started from, to go back to */
		from?: string | null;
	} = $props();

	let type = $state(untrack(() => values.type));
	let repeat = $state(untrack(() => values.repeat));
	let weekdays = $state(untrack(() => values.weekdays));
	let every = $state(untrack(() => values.every));
	let unit = $state(untrack(() => values.unit));
	let nextDue = $state(untrack(() => values.nextDue));
	let scheduleMode = $state(untrack(() => values.scheduleMode));
	let tankId = $state(untrack(() => values.tankId));
	let onDone = $state(untrack(() => values.onDone));
	let busy = $state(false);

	const days = $derived((parseNumber(every) ?? 0) * (unit === 'weeks' ? 7 : 1));
	const examples = $derived(days > 0 && nextDue ? scheduleExamples(nextDue, days) : null);
	const routine = $derived(type !== 'task');
	const title = $derived(
		mode === 'edit' ? (routine ? 'Edit routine' : 'Edit task') : type === 'dosing' ? 'New dosing routine' : type === 'feeding' ? 'New feeding routine' : 'New task'
	);
	const units = $derived(type === 'dosing' ? DOSING_UNITS : FEED_UNITS);
</script>

<form
	method="POST"
	action="{action}?/save"
	class="tform"
	class:compact
	use:enhance={() => {
		busy = true;
		return async ({ result, update }) => {
			if (result.type === 'redirect' && afterSave) await goto(afterSave, { invalidateAll: true, noScroll: true, keepFocus: true });
			// the pane posts to /tasks/[id], which `update` won't apply on /tasks: show its errors here
			else if (result.type === 'failure') await applyAction(result);
			else await update({ reset: false });
			busy = false;
		};
	}}
>
	{#if compact}
		<div class="phead">
			<h2>{title}</h2>
			{#if mode === 'new'}<a class="close" href={cancelHref} aria-label="Close">✕</a>{/if}
		</div>
	{:else}
		<div class="bar hide-desk">
			<a class="cancel" href={cancelHref}>Cancel</a>
			<h1>{title}</h1>
			<button class="save-top" disabled={busy}>Save</button>
		</div>
	{/if}

	<div class="body">
		{#if from}<input type="hidden" name="from" value={from} />{/if}
		{#if mode === 'new'}
			<fieldset class="field">
				<legend class="sr-only">What it is</legend>
				<div class="segmented kind">
					<label><input type="radio" name="type" value="task" bind:group={type} />Task</label>
					<label><input type="radio" name="type" value="dosing" bind:group={type} />Dosing</label>
					<label><input type="radio" name="type" value="feeding" bind:group={type} />Feeding</label>
				</div>
			</fieldset>
		{/if}

		{#if routine}
			<div class="dose">
				<div class="field product">
					<label class="label" for="t-product">{type === 'dosing' ? 'Product' : 'Food'}</label>
					<input
						class="input"
						id="t-product"
						name="product"
						defaultValue={values.product}
						required
						maxlength="80"
						autocomplete="off"
						list={type === 'dosing' ? 't-products' : undefined}
						placeholder={type === 'dosing' ? 'e.g. Thrive S' : 'e.g. Micro pellets'}
						aria-invalid={!!errors.product}
					/>
					{#if type === 'dosing'}
						<datalist id="t-products">{#each products as p (p)}<option value={p}></option>{/each}</datalist>
					{/if}
					{#if errors.product}<span class="error-text">✕ {errors.product}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="t-amount">Amount</label>
					<input class="input" id="t-amount" name="amount" inputmode="decimal" autocomplete="off" defaultValue={values.amount} placeholder="Optional" aria-invalid={!!errors.amount} />
					{#if errors.amount}<span class="error-text">✕ {errors.amount}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="t-unit">Unit</label>
					{#key type}
						<select class="input" id="t-unit" name="amountUnit" value={values.amountUnit || (type === 'dosing' ? 'mL' : '')}>
							{#if type === 'feeding'}<option value="">—</option>{/if}
							{#each units as u (u)}<option value={u}>{u}</option>{/each}
						</select>
					{/key}
				</div>
			</div>
		{:else}
			<div class="field">
				<label class="label" for="t-name">Task</label>
				<input class="input" id="t-name" name="name" defaultValue={values.name} required maxlength="80" placeholder="e.g. Clean canister filter" aria-invalid={!!errors.name} />
				{#if errors.name}<span class="error-text">✕ {errors.name}</span>{/if}
			</div>
		{/if}

		<div class="field">
			<label class="label" for="t-tank">Tank</label>
			<select class="input" id="t-tank" name="tankId" bind:value={tankId}>
				{#each tanks as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
			</select>
		</div>

		<fieldset class="field">
			<legend class="sr-only">Repeat</legend>
			<div class="segmented repeat">
				<label><input type="radio" name="recurring" value="yes" defaultChecked={repeat === 'every'} onchange={() => (repeat = 'every')} />Recurring</label>
				<label><input type="radio" name="recurring" value="days" defaultChecked={repeat === 'days'} onchange={() => (repeat = 'days')} />On days</label>
				<label><input type="radio" name="recurring" value="no" defaultChecked={repeat === 'no'} onchange={() => (repeat = 'no')} />One-off</label>
			</div>
		</fieldset>

		{#if repeat === 'days'}
			<fieldset class="field">
				<legend class="label">On these days</legend>
				<div class="days" class:invalid={!!errors.weekdays}>
					{#each WEEKDAYS as w (w.day)}
						<label class="day" title={w.name}>
							<input type="checkbox" name="weekday" value={w.day} bind:group={weekdays} aria-label={w.name} />
							<span aria-hidden="true">{w.short}</span>
						</label>
					{/each}
				</div>
				{#if errors.weekdays}<span class="error-text">✕ {errors.weekdays}</span>{/if}
			</fieldset>
		{/if}

		{#if compact}
			<!-- D5: "Every" and "Next due" side by side -->
			<div class="pair">
				{#if repeat === 'every'}
					<div class="field">
						<label class="label" for="t-every">Every</label>
						<div class="unit-input every-box" class:invalid={!!errors.every}>
							<input id="t-every" name="every" inputmode="numeric" bind:value={every} aria-invalid={!!errors.every} />
							<select name="unit" bind:value={unit} aria-label="Days or weeks">
								<option value="days">days</option>
								<option value="weeks">weeks</option>
							</select>
						</div>
					</div>
				{/if}
				<div class="field">
					<label class="label" for="t-due">Next due</label>
					<DateField name="nextDue" id="t-due" bind:value={nextDue} required label="Next due" format="weekday" {today} invalid={!!errors.nextDue} />
				</div>
			</div>
			{#if repeat === 'every' && errors.every}<span class="error-text">✕ {errors.every}</span>{/if}
			{#if errors.nextDue}<span class="error-text">✕ {errors.nextDue}</span>{/if}
		{:else}
			{#if repeat === 'every'}
				<fieldset class="field">
					<legend class="label">Repeat every</legend>
					<div class="every">
						<input class="input num-in" name="every" inputmode="numeric" bind:value={every} aria-label="Number" aria-invalid={!!errors.every} />
						<div class="segmented">
							<label><input type="radio" name="unit" value="days" bind:group={unit} />days</label>
							<label><input type="radio" name="unit" value="weeks" bind:group={unit} />weeks</label>
						</div>
					</div>
					{#if errors.every}<span class="error-text">✕ {errors.every}</span>{/if}
				</fieldset>
			{/if}

			<div class="field">
				<label class="label" for="t-due">Next due</label>
				<DateField name="nextDue" id="t-due" bind:value={nextDue} required label="Next due" format="weekday" {today} invalid={!!errors.nextDue} />
				{#if errors.nextDue}<span class="error-text">✕ {errors.nextDue}</span>{/if}
			</div>
		{/if}

		{#if repeat === 'every'}
			<fieldset class="field">
				<legend class="label">Schedule counts from</legend>
				<div class="choices">
					<label class="choice">
						<input class="radio" type="radio" name="scheduleMode" value="completion" bind:group={scheduleMode} />
						<span class="c-text"><strong>When I complete it</strong><small>{examples?.completion ?? "Next due counts from the day it's done"}</small></span>
					</label>
					<label class="choice">
						<input class="radio" type="radio" name="scheduleMode" value="fixed" bind:group={scheduleMode} />
						<span class="c-text"><strong>Fixed calendar</strong><small>{examples?.fixed ?? 'Stays on the same schedule'}</small></span>
					</label>
				</div>
			</fieldset>
		{/if}

		{#if routine}
			<p class="hint">{type === 'dosing' ? 'Marking it done logs the dose in History.' : 'Marking it done logs the feeding in History.'}</p>
		{:else}
			<div class="field">
				<label class="label" for="t-done">When marked done</label>
				<select class="input" id="t-done" name="onDone" bind:value={onDone}>
					<option value="none">Just mark it done</option>
					<option value="water_change">Open the water change form</option>
					<option value="test">Open the water test form</option>
				</select>
			</div>
		{/if}
	</div>

	<div class="foot">
		{#if mode === 'edit'}
			<button type="button" class="delete" popovertarget="confirm-task-delete">{compact ? 'Delete' : routine ? 'Delete routine' : 'Delete task'}</button>
		{/if}
		{#if !compact}<a class="btn cancel-btn hide-phone" href={cancelHref}>Cancel</a>{/if}
		<button class="btn btn-primary save" disabled={busy}>Save</button>
	</div>
</form>

{#if mode === 'edit'}
	<ConfirmDelete
		id="confirm-task-delete"
		trigger={false}
		title="Delete “{values.name}”?"
		body={routine ? 'The routine is removed. The doses and feedings it logged stay in the history.' : 'The reminder is removed. Entries you logged stay in the history.'}
		action="{action}?/delete"
	/>
{/if}

<style>
	.tform {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		max-width: 560px;
		margin-inline: auto;
	}
	/* 15: Cancel · Edit task · Save */
	.bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 4px 20px 8px;
	}
	.cancel {
		justify-self: start;
		font-size: 16px;
		color: var(--text-muted);
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	.cancel:hover {
		color: var(--text);
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
	.save-top:disabled {
		opacity: 0.45;
	}
	.body {
		padding: 8px 20px 12px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		flex: 1;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	.field :global(.input[aria-invalid='true']) {
		border-color: var(--bad);
	}
	legend {
		padding: 0;
		margin-bottom: 8px;
	}
	.every {
		display: flex;
		gap: 8px;
	}
	/* a routine: what, how much, the unit */
	.dose {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 10px 8px;
	}
	.dose .product {
		grid-column: 1 / -1;
	}
	/* On these days: seven toggles, Mon first */
	.days {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 6px;
	}
	.day {
		position: relative;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: var(--surface);
		font-size: 14px;
		font-weight: 600;
		color: var(--text-muted);
		cursor: pointer;
	}
	.day input {
		position: absolute;
		inset: 0;
		opacity: 0;
		margin: 0;
		cursor: pointer;
	}
	.day:has(input:checked) {
		background: var(--selected);
		border-color: var(--accent);
		color: var(--accent);
	}
	.day:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.days.invalid .day {
		border-color: var(--bad);
	}
	.hint {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.num-in {
		width: 96px;
		flex-shrink: 0;
		text-align: center;
		font-size: 20px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.every .segmented {
		flex: 1;
	}
	/* 15: the two schedule modes as one list */
	.choices {
		display: flex;
		flex-direction: column;
		border-radius: 14px;
		border: 1px solid var(--border);
		background: var(--surface);
	}
	.choice {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		padding: 14px;
		cursor: pointer;
	}
	.choice + .choice {
		border-top: 1px solid var(--border);
	}
	.choice:has(.radio:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
		border-radius: 13px;
	}
	.radio:focus-visible {
		outline: none;
	}
	.c-text {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.c-text strong {
		font-size: 15px;
		font-weight: 600;
	}
	.c-text small {
		font-size: 13px;
		line-height: 1.4;
		color: var(--text-muted);
	}
	/* Save, then "Delete task" centered below it (15) */
	.foot {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column-reverse;
		gap: 12px;
	}
	.save {
		height: 56px;
		border-radius: 14px;
		font-size: 17px;
	}
	.delete {
		align-self: center;
		min-height: 44px;
		padding: 0 16px;
		border-radius: 12px;
		font-size: 16px;
		font-weight: 600;
		color: var(--bad);
	}
	@media (hover: hover) {
		.delete:hover {
			background: var(--bad-bg);
		}
	}

	/* ── D5 edit pane ─────────────────────────────────────────────── */
	.compact {
		min-height: 0;
		max-width: none;
		margin: 0;
		flex: 1 0 auto;
		gap: 16px;
	}
	.phead {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.phead h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
	}
	.close {
		width: 36px;
		height: 36px;
		margin: -6px -8px -6px 0;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 15px;
		color: var(--text-muted);
	}
	.close:hover {
		background: var(--surface-hi);
		color: var(--text);
	}
	.compact .body {
		padding: 0;
		gap: 16px;
		flex: none;
	}
	.compact legend {
		margin-bottom: 6px;
	}
	.compact .field {
		gap: 6px;
	}
	.compact .label {
		font-size: 13px;
	}
	.compact .field :global(.input) {
		height: 44px;
		border-radius: 10px;
		padding: 0 12px;
		font-size: 15px;
	}
	.compact .field select.input {
		padding-right: 36px;
		background-position:
			calc(100% - 19px) 52%,
			calc(100% - 14px) 52%;
	}
	.compact .segmented {
		border-radius: 12px;
	}
	.compact .segmented label {
		min-height: 36px;
		border-radius: 8px;
		font-size: 14px;
	}
	.pair {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(0, 1fr);
		gap: 10px;
	}
	.every-box {
		height: 44px;
		border-radius: 10px;
		padding: 0 4px 0 12px;
		gap: 4px;
	}
	.every-box.invalid {
		border-color: var(--bad);
	}
	.every-box input {
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}
	.every-box select {
		appearance: none;
		-webkit-appearance: none;
		background-color: transparent;
		border: none;
		border-radius: 8px;
		align-self: stretch;
		padding: 0 22px 0 6px;
		font-size: 13px;
		color: var(--text-muted);
		cursor: pointer;
		background-image:
			linear-gradient(45deg, transparent 50%, var(--text-muted) 50%),
			linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);
		background-position:
			calc(100% - 13px) 52%,
			calc(100% - 9px) 52%;
		background-size: 4px 4px;
		background-repeat: no-repeat;
	}
	.every-box select:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.compact .choices {
		border: none;
		background: none;
		border-radius: 0;
		gap: 10px;
	}
	.compact .choice {
		padding: 0;
		gap: 10px;
	}
	.compact .choice + .choice {
		border-top: none;
	}
	.compact .choice:has(.radio:focus-visible) {
		outline-offset: 2px;
		border-radius: 6px;
	}
	.compact .c-text {
		gap: 2px;
		padding-top: 1px;
	}
	.compact .c-text strong {
		font-size: 14px;
	}
	.compact .c-text small {
		font-size: 12px;
	}
	.compact .foot {
		margin-top: auto;
		padding: 8px 0 0;
		flex-direction: row;
		justify-content: flex-end;
		align-items: center;
		gap: 10px;
	}
	.compact .delete {
		align-self: auto;
		margin-right: auto;
		margin-left: -14px;
		padding: 0 14px;
		border-radius: 10px;
		font-size: 14px;
	}
	.compact .save {
		height: 44px;
		padding: 0 18px;
		border-radius: 10px;
		font-size: 15px;
	}

	/* ── Desktop: the form as a centered card; the header has the title ── */
	@media (min-width: 1024px) {
		.tform:not(.compact) {
			min-height: 0;
			max-width: 640px;
			margin: 28px auto;
			padding: 24px 28px;
			background: var(--surface);
			border: 1px solid var(--border);
			border-radius: 20px;
		}
		.tform:not(.compact) .body {
			padding: 0;
		}
		/* recessed fields on the card */
		.tform:not(.compact) .field :global(.input),
		.tform:not(.compact) .segmented,
		.tform:not(.compact) .choices {
			background-color: var(--surface-2);
		}
		.tform:not(.compact) .foot {
			margin-top: 24px;
			padding: 20px 0 0;
			border-top: 1px solid var(--border);
			flex-direction: row;
			justify-content: flex-end;
			align-items: center;
		}
		.tform:not(.compact) .delete {
			align-self: auto;
			margin-right: auto;
			margin-left: -16px;
			font-size: 15px;
		}
		.tform:not(.compact) .save {
			height: 44px;
			padding: 0 22px;
			border-radius: 12px;
			font-size: 15px;
		}
		.cancel-btn {
			font-weight: 600;
		}
	}
</style>
