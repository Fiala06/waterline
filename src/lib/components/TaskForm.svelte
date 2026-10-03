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
	import { endsAfterTimes, FEED_UNITS, scheduleExamples, WEEKDAYS } from '$lib/tasks';
	import { fmtDate } from '$lib/time';
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
		/** a course: runs until a date, or for N times */
		ends: 'never' | 'on' | 'times';
		endsOn: string;
		endsTimes: string;
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
	let ends = $state(untrack(() => values.ends));
	let endsOn = $state(untrack(() => values.endsOn));
	let endsTimes = $state(untrack(() => values.endsTimes));
	let busy = $state(false);

	const days = $derived((parseNumber(every) ?? 0) * (unit === 'weeks' ? 7 : 1));
	const examples = $derived(days > 0 && nextDue ? scheduleExamples(nextDue, days) : null);
	const routine = $derived(type !== 'task');
	const title = $derived(
		mode === 'edit' ? (routine ? 'Edit routine' : 'Edit task') : type === 'dosing' ? 'New dosing routine' : type === 'feeding' ? 'New feeding routine' : 'New task'
	);
	const units = $derived(type === 'dosing' ? DOSING_UNITS : FEED_UNITS);
	// "After 5 times" → the day of the fifth: "ends Oct 9"
	const timesEnd = $derived.by(() => {
		const n = parseNumber(endsTimes);
		if (!n || !nextDue) return null;
		return endsAfterTimes(
			{ recurring: true, intervalDays: days || null, scheduleMode: repeat === 'days' ? 'weekdays' : scheduleMode, weekdays: weekdays.join(','), nextDue },
			n
		);
	});
	const times = $derived(type === 'dosing' ? 'doses' : type === 'feeding' ? 'feedings' : 'times');
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
			<div class="phead-text">
				<span class="kicker">{mode === 'edit' ? (routine ? 'Routine' : 'Task') : 'New'}</span>
				<h2>{title}</h2>
			</div>
			{#if mode === 'new'}<a class="close" href={cancelHref}>Close ✕</a>{/if}
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

		{#if repeat !== 'no'}
			<!-- a course (a treatment, a round of doses) stops: on a date, or after N times -->
			<fieldset class="field">
				<legend class="label">Ends</legend>
				<div class="segmented ends-seg">
					<label><input type="radio" name="ends" value="never" bind:group={ends} />Never</label>
					<label><input type="radio" name="ends" value="on" bind:group={ends} />On a date</label>
					<label><input type="radio" name="ends" value="times" bind:group={ends} />After</label>
				</div>
				{#if ends === 'on'}
					<div class="ends-in">
						<DateField name="endsOn" id="t-ends" bind:value={endsOn} required label="Last day" format="weekday" min={nextDue || today} {today} invalid={!!errors.endsOn} />
						{#if errors.endsOn}<span class="error-text">✕ {errors.endsOn}</span>{/if}
					</div>
				{:else if ends === 'times'}
					<div class="ends-in">
						<div class="every">
							<input class="input num-in" name="endsTimes" inputmode="numeric" bind:value={endsTimes} aria-label="How many times" aria-invalid={!!errors.endsTimes} />
							<span class="times-word">{times}{#if timesEnd}<span class="muted">{` · ends ${fmtDate(timesEnd)}`}</span>{/if}</span>
						</div>
						{#if errors.endsTimes}<span class="error-text">✕ {errors.endsTimes}</span>{/if}
					</div>
				{/if}
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
		font-weight: 800;
	}
	.save-top {
		justify-self: end;
		color: var(--accent-text);
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
		border-radius: 0;
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
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
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
	.ends-in {
		margin-top: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.times-word {
		align-self: center;
		font-size: 15px;
	}
	.times-word .muted {
		color: var(--text-muted);
	}
	.compact .num-in {
		height: 44px;
		font-size: 15px;
	}
	.compact .times-word {
		font-size: 14px;
	}
	/* 15: the two schedule modes as one list */
	.choices {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--divider);
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
		border-radius: 0;
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
		border-radius: 0;
		font-size: 17px;
	}
	.delete {
		align-self: center;
		min-height: 44px;
		padding: 0 16px;
		border-radius: 0;
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
		align-items: flex-start;
		gap: 12px;
	}
	.phead-text {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.phead h2 {
		margin: 0;
		font-size: 22px;
	}
	.close {
		min-height: 36px;
		margin: -6px -8px 0 0;
		padding: 0 8px;
		display: flex;
		align-items: center;
		font-size: 14px;
		font-weight: 800;
		color: var(--accent-text);
	}
	.close:hover {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
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
		border-radius: 0;
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
		border-radius: 0;
	}
	.compact .segmented label {
		min-height: 36px;
		border-radius: 0;
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
		border-radius: 0;
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
		border-radius: 0;
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
		border-radius: 0;
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
		padding: 14px 0 0;
		border-top: 2px solid var(--divider);
		flex-direction: row;
		align-items: center;
		gap: 10px;
	}
	.compact .delete {
		align-self: auto;
		padding: 0 14px;
		font-size: 14px;
		border: 1px solid var(--divider);
	}
	.compact .save {
		flex: 1;
		height: 44px;
		padding: 0 18px;
		font-size: 14px;
	}

	/* ── Desktop: a flat form under the shell's title, 2px rule above the footer ── */
	@media (min-width: 1024px) {
		.tform:not(.compact) {
			min-height: 0;
			max-width: 640px;
			margin: 0;
			padding: 24px 32px 40px;
		}
		.tform:not(.compact) .body {
			padding: 0;
		}
		.tform:not(.compact) .foot {
			margin-top: 20px;
			padding: 16px 0 0;
			border-top: 2px solid var(--divider);
			flex-direction: row;
			justify-content: flex-start;
			align-items: center;
		}
		.tform:not(.compact) .delete {
			align-self: auto;
			margin-left: auto;
			font-size: 14px;
			font-weight: 800;
		}
		.tform:not(.compact) .save {
			order: -1;
			height: 44px;
			padding: 0 22px;
			font-size: 14px;
		}
		.cancel-btn {
			border: none;
			color: var(--text-muted);
		}
	}
</style>
