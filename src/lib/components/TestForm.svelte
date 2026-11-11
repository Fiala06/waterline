<script lang="ts">
	import { onMount, untrack } from 'svelte';
	// 05 / 08 / G6 · Water test form. Every field is optional; numeric keypad;
	// previous reading shown faintly; inline status as you type. New tests can
	// start from the last readings and log a water change alongside.
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import CustomParamSheet from './CustomParamSheet.svelte';
	import KitRun from './KitRun.svelte';
	import LogFormShell from './LogFormShell.svelte';
	import PhotoDateOffer from './PhotoDateOffer.svelte';
	import PhotoPicker from './PhotoPicker.svelte';
	import TaskCheckRow from './TaskCheckRow.svelte';
	import Tip from './Tip.svelte';
	import WaterChangeFields from './WaterChangeFields.svelte';
	import { statusLong, statusShort } from '$lib/status';
	import type { ExifDate } from '$lib/exif';
	import type { When } from '$lib/time';
	import { kitKeyFor, type KitStep } from '$lib/kits';
	import { entryHref } from './entry-form';
	import { attentionSummary, cleanReading, readingRow, shortStatus, statusWord, testSaveLabel, waterChangeSummary, type TestParam as Param } from './test-form';
	let {
		mode = 'new',
		tankName,
		params,
		values = {},
		initialNote = '',
		initialWhen = null,
		timeZone,
		closeHref,
		returnTo = null,
		task = null,
		error = null,
		fieldErrors = {},
		meta = null,
		existingPhotos = [],
		previous = {},
		remove = null,
		ontankclick,
		targetsHref = null,
		reusable = [],
		draftKey = null,
		waterChange = null,
		kits = {}
	}: {
		mode?: 'new' | 'edit';
		tankName: string;
		params: Param[];
		values?: Record<string, string>;
		initialNote?: string;
		initialWhen?: When | null;
		timeZone: string;
		closeHref: string;
		/** where Save goes back to when the form was opened from somewhere (a routine's run page, #92) */
		returnTo?: string | null;
		task?: { id: string; label: string; sub?: string; checked: boolean } | null;
		error?: string | null;
		fieldErrors?: Record<string, string>;
		meta?: string | null;
		existingPhotos?: { id: string }[];
		/** edit mode: values before the last edit, for "was 40" */
		previous?: Record<string, string>;
		/** edit mode: the entry's delete action and its confirmation (G6 "Delete entry") */
		remove?: { action: string; title: string; body: string } | null;
		ontankclick?: () => void;
		/** 08 "+ Add parameter": the tank's parameters & targets page */
		targetsHref?: string | null;
		/** custom parameters from other tanks, offered by "+ Add parameter" */
		reusable?: { name: string; unit: string; min: number | null; max: number | null; decimals: number; tank: string }[];
		/** New tests: keep what was typed on this device until it's saved */
		draftKey?: string | null;
		/** test kits (#21): the steps to run beside a parameter, by its kit key */
		kits?: Record<string, { id: string; name: string; steps: KitStep[] }>;
		/** New tests: "Also log a water change", on when the last test had one */
		waterChange?: {
			on: boolean;
			amountMode: string;
			amount: string;
			source: string;
			task: { id: string; label: string; sub?: string; checked: boolean } | null;
			volUnit: string;
			tankVolume: number | null;
			tankVolumeIsActual: boolean;
		} | null;
	} = $props();

	let draft = $state<Record<string, string>>(untrack(() => ({ ...values })));
	// a kit's countdown or "time's up" shows in the row's flag while it runs (#21)
	let kitState = $state<Record<string, { running: boolean; clock: string | null; done: boolean }>>({});
	const kitFor = (p: { id: string; key?: string; name: string }) => (mode === 'new' && p.key ? kits[kitKeyFor({ key: p.key, name: p.name })] : undefined);
	let saved = $state<Record<string, string>>(untrack(() => ({ ...values })));
	let note = $state(untrack(() => initialNote));
	let when = $state<When | null>(untrack(() => initialWhen));
	// A photo taken on another day than the test (#42): offer its date, without changing the test by itself.
	let photoDates = $state<(ExifDate | null)[]>([]);
	// "+ Add parameter" opens G7 here, so the test in progress stays on screen
	let addOpen = $state(false);
	let desk = $state(false);
	onMount(() => {
		const mq = matchMedia('(min-width: 1024px)');
		const sync = () => (desk = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	const rows = $derived(params.map((p) => readingRow(p, draft[p.id] ?? '', { mode, saved: saved[p.id], previous: previous[p.id] })));
	type Row = (typeof rows)[number];
	// a new test leads with the basics; the rest wait under "N more parameters" (#65)
	const shown = $derived(mode === 'new' ? rows.filter((r) => !r.later) : rows);
	const later = $derived(mode === 'new' ? rows.filter((r) => r.later) : []);
	const filled = $derived(rows.filter((r) => r.v != null).length);

	// the other log types, with the tank and time this one has (README § 11)
	const typeHref = (t: string) =>
		t === 'test' ? entryHref(page.url.searchParams, '/entries/test/new') : entryHref(page.url.searchParams, '/entries/event/new', t);
	function clearAll() {
		for (const p of params) draft[p.id] = '';
		copied = null;
	}
	// "▲ Nitrate is above target. Saving adds it to Needs attention.", before Save
	const summary = $derived(mode === 'new' ? attentionSummary(rows) : '');

	// "Use last readings": each empty field gets its previous reading; Undo
	// empties the ones still holding it.
	const fillable = $derived(mode === 'new' ? params.filter((p) => p.lastInput != null && !(draft[p.id] ?? '')) : []);
	let copied = $state<Record<string, string> | null>(null);
	// without scripts the link asks the server for the form filled in
	const fillHref = $derived.by(() => {
		const q = new URLSearchParams(page.url.searchParams);
		q.set('fill', 'last');
		return `?${q}`;
	});
	function useLast() {
		const c: Record<string, string> = {};
		for (const p of fillable) draft[p.id] = c[p.id] = p.lastInput!;
		copied = c;
	}
	function undoLast() {
		for (const [id, v] of Object.entries(copied ?? {})) if (draft[id] === v) draft[id] = '';
		copied = null;
	}

	// "Also log a water change": saved as its own entry, at the test's time
	let wcOn = $state(untrack(() => !!waterChange?.on));
	let wcMode = $state(untrack(() => waterChange?.amountMode ?? 'percent'));
	let wcAmount = $state(untrack(() => waterChange?.amount ?? '25'));
	let wcSource = $state(untrack(() => waterChange?.source ?? 'tap'));
	const wcSummary = $derived(waterChangeSummary(wcAmount, wcMode, waterChange?.volUnit ?? '', wcSource));
	const withWc = $derived(mode === 'new' && !!waterChange && wcOn);

	// A test that was left before it was saved comes back, saying how much
	const restoredLabel = () => (filled ? `Restored ${filled} unsaved reading${filled === 1 ? '' : 's'}` : "Restored what you hadn't saved");
	const outOfRange = $derived(rows.filter((r) => r.st?.level === 'bad').length);
	const saveLabel = $derived(testSaveLabel(mode, filled, withWc));

	function clean(id: string, e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const v = cleanReading(el.value);
		draft[id] = v;
		if (el.value !== v) el.value = v;
	}

	// Tab and Enter go from one reading to the next (#184), past a kit's Start
	// and Steps and the next name's ⓘ; Shift+Tab still reaches those. Enter
	// never saves the test: after the last reading it goes on to the note.
	function nextReading(e: KeyboardEvent) {
		if ((e.key !== 'Tab' && e.key !== 'Enter') || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
		const back = e.shiftKey;
		if (e.key === 'Tab' && back) return;
		if (e.key === 'Enter') e.preventDefault();
		const el = e.currentTarget as HTMLInputElement;
		// the folded "N more parameters" aren't on screen until opened
		const all = [...(el.form?.querySelectorAll<HTMLInputElement>('input[name^="v_"]') ?? [])].filter((i) => !i.closest('details:not([open])'));
		const to = all[all.indexOf(el) + (back ? -1 : 1)] ?? (e.key === 'Enter' && !back ? el.form?.querySelector<HTMLInputElement>('input[name="note"]') : null);
		if (!to) return;
		e.preventDefault();
		to.focus();
		to.select();
	}

	// The whole box is the tap target, also where the value doesn't reach.
	function focusField(e: MouseEvent) {
		if (!(e.target instanceof HTMLInputElement)) (e.currentTarget as HTMLElement).querySelector('input')?.focus();
	}
</script>

{#snippet paramRow(r: Row)}
				<div class="row">
					<div class="line">
						<!-- the name is the field's label; the target or "Last 7.0" describes it -->
						<div class="lbl">
							<span class="pline"
								><label class="pname" for="v_{r.id}">{r.name}</label>{#if r.tip}<Tip text={r.tip} when={r.when} label="About {r.name}" />{/if}</span
							>
							<span class="last" id="last_{r.id}">
								{#if mode === 'edit'}
									{#if r.st}
										<span class="status-{r.st.level}"
											>{shortStatus(r)}{#if r.was}{' · '}<span class="was">was {r.was}</span>{/if}</span
										>
									{:else if r.was}
										<span class="was">was {r.was}</span>
									{:else}
										{r.rangeText ? `Target ${r.rangeText}` : 'No target'}
									{/if}
								{:else}
									{r.rangeText ? `Target ${r.rangeText}` : 'No target'}
								{/if}
							</span>
						</div>
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<div
							class="box"
							class:empty={r.v == null}
							class:warn={mode === 'new' && r.st?.level === 'warn'}
							class:bad={mode === 'new' && r.st?.level === 'bad'}
							onclick={focusField}
						>
							<input
								id="v_{r.id}"
								name="v_{r.id}"
								inputmode="decimal"
								enterkeyhint="next"
								autocomplete="off"
								placeholder="–"
								value={r.raw}
								oninput={(e) => clean(r.id, e)}
								onkeydown={nextReading}
								aria-describedby={[`last_${r.id}`, mode === 'new' && r.st ? `s_${r.id}` : ''].filter(Boolean).join(' ')}
								aria-invalid={r.st?.level === 'bad' || !!fieldErrors[r.id]}
							/>
						</div>
						<div class="flag">
							{#if r.unit}<span class="unit">{r.unit}</span>{/if}
							{#if kitState[r.id]?.clock}
								<span class="clock" role="timer">{kitState[r.id].clock}</span>
							{:else if kitState[r.id]?.done && r.v == null}
								<span class="st status-ok" aria-hidden="true">⏱</span>
							{:else if mode === 'new' && r.st}
								<span class="st status-{r.st.level}" aria-hidden="true">{r.st.level === 'ok' ? '✓' : statusShort(r.st)}</span>
							{:else if mode === 'new' && r.last && r.lastInput != null}
								<!-- tap to use it (#183); out of the Tab order, "Use last readings" does all of them -->
								<button
									type="button"
									class="lastv"
									tabindex="-1"
									aria-label="Use {r.lastValue.toLowerCase()} for {r.name}"
									onclick={() => (draft[r.id] = r.lastInput!)}>{r.lastValue}</button
								>
							{:else if mode === 'new' && r.last}
								<span class="lastv">{r.lastValue}</span>
							{/if}
						</div>
					</div>
					{#if mode === 'new' && r.st}
						<!-- the flag beside the field is short; the full reading of it, for screen readers -->
						<div class="msg st-msg status-{r.st.level}" id="s_{r.id}">{statusLong(r.st, r.rangeText)}</div>
					{/if}
					{#if fieldErrors[r.id]}<div class="msg status-bad">✕ {fieldErrors[r.id]}</div>{/if}
					{#if kitFor(r)}
						{@const kit = kitFor(r)!}
						<KitRun {kit} paramName={r.name} onstate={(s) => (kitState[r.id] = s)} />
					{/if}
					{#if r.drops}
						{@const d = r.drops}
						<div class="msg hard-hint drops" aria-live="polite">
							<span
								>{d.times10 ? `${r.raw} looks like ${d.drops} drops × 10. ` : 'Counted drops? '}{d.drops}
								{d.drops === 1 ? 'drop is' : 'drops are'} about {d.ppm} ppm (×&nbsp;17.9).</span
							>
							<button type="button" class="btn use-ppm" onclick={() => (draft[r.id] = String(d.ppm))}>Use {d.ppm} ppm</button>
							<span class="or">Or switch hardness to degrees in <a href="/settings#units">Settings</a>.</span>
						</div>
					{:else if r.degrees && r.v == null}
						<div class="msg hard-hint">1 drop = 1° on API/JBL/Tetra kits.</div>
					{/if}
				</div>
{/snippet}


<LogFormShell
	{mode}
	current="test"
	typeHref={mode === 'new' ? typeHref : null}
	{tankName}
	title={mode === 'edit' ? 'Edit water test' : 'Log water test'}
	bind:when
	{timeZone}
	{closeHref}
	{returnTo}
	{saveLabel}
	queueTitle={() => `Water test · ${filled} reading${filled === 1 ? '' : 's'}${withWc ? ' + water change' : ''}`}
	{draftKey}
	{restoredLabel}
	{meta}
	{error}
	{remove}
	{ontankclick}
>
	{#if mode === 'new'}
		<div class="use-last" aria-live="polite">
			{#if copied}
				<span class="filled-note">✓ Filled {Object.keys(copied).length} from last readings</span>
				<button type="button" class="btn-text" onclick={undoLast}>Undo</button>
			{:else if fillable.length}
				<a
					class="btn-text use"
					href={fillHref}
					onclick={(e) => {
						e.preventDefault();
						useLast();
					}}>Use last readings</a
				>
			{:else}
				<span class="filled-note">All fields optional</span>
			{/if}
			{#if filled}<button type="button" class="btn-text clear" onclick={clearAll}>Clear</button>{/if}
		</div>
	{/if}

	<div class="rows">
		{#each shown as r (r.id)}{@render paramRow(r)}{/each}
		{#if later.length}
			<!-- the ones a beginner's kit doesn't cover, folded (#65); inside, they still post with the form -->
			<details class="later" open={later.some((r) => r.raw !== '' || fieldErrors[r.id])}>
				<summary
					><span class="later-n">{later.length} more parameter{later.length === 1 ? '' : 's'}</span>
					<span class="later-names">{later.map((r) => r.name).join(', ')}</span></summary
				>
				{#each later as r (r.id)}{@render paramRow(r)}{/each}
			</details>
		{/if}
		{#if mode === 'new' && targetsHref}
			<a
				class="add-param"
				href={targetsHref}
				onclick={(e) => {
					e.preventDefault();
					addOpen = true;
				}}>+ Add parameter</a
			>
			<!-- the ranges and which parameters are tested live on the targets page; Save there comes back here -->
			<a class="add-param edit-targets" href="{targetsHref}?from={encodeURIComponent(page.url.pathname + page.url.search)}"
				>Edit targets and parameters ›</a
			>
		{/if}
	</div>

	<div class="note-row">
		<input
			class="input note"
			name="note"
			bind:value={note}
			maxlength="2000"
			placeholder={desk ? 'Note, e.g. “before water change”' : 'Add note…'}
			aria-label="Note"
		/>
		<PhotoPicker compact existing={existingPhotos} ontaken={(d) => (photoDates = d)} />
	</div>
	<PhotoDateOffer dates={photoDates} bind:when {timeZone} />

	{#if task}
		<div class="task-gap"><TaskCheckRow {task} entryDate={when?.date} /></div>
	{/if}

	{#if mode === 'new' && waterChange}
		<!-- without JS the checkbox opens the block too (:has) -->
		<div class="wc" class:on={wcOn}>
			<label class="check-row wc-toggle">
				<input type="checkbox" name="wc" value="1" bind:checked={wcOn} />
				<span class="wc-head">
					<span class="wc-title">Also log a water change</span>
					<span class="wc-sub">{wcSummary}</span>
				</span>
			</label>
			<div class="wc-body">
				<WaterChangeFields
					compact
					bind:amountMode={wcMode}
					bind:amount={wcAmount}
					bind:source={wcSource}
					volUnit={waterChange.volUnit}
					tankVolume={waterChange.tankVolume}
					tankVolumeIsActual={waterChange.tankVolumeIsActual}
					error={fieldErrors.amount}
				/>
				{#if waterChange.task}
					<TaskCheckRow task={waterChange.task} entryDate={when?.date} name="wcCompleteTask" bare />
				{/if}
			</div>
		</div>
	{/if}

	{#snippet footNote()}
		{#if summary}<p class="summary status-warn" aria-live="polite">{summary}</p>{/if}
	{/snippet}
	{#snippet footInfo()}
		{#if mode === 'new'}{filled} of {params.length} filled{outOfRange ? ` · ${outOfRange} out of range` : ''}{/if}
	{/snippet}
</LogFormShell>

{#if mode === 'new' && targetsHref}
	<CustomParamSheet bind:open={addOpen} {tankName} {reusable} action="{targetsHref}?/addCustom" onadded={() => invalidateAll()} />
{/if}

<style>
	.use-last {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 44px;
		margin: 2px 0;
	}
	.use {
		padding-left: 0;
	}
	.clear {
		margin-left: auto;
		color: var(--text-muted);
	}
	.filled-note {
		font-size: 13px;
		color: var(--text-muted);
	}

	/* ── Readings: one row each under a 2px ink rule ── */
	.rows {
		display: flex;
		flex-direction: column;
		border-top: 2px solid var(--ink);
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px 0;
		border-bottom: 1px solid var(--divider);
	}
	.line {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 96px 84px;
		gap: 10px;
		align-items: center;
		min-height: 44px;
	}
	.lbl {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.pline {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
	}
	.pname {
		font-size: 15px;
		font-weight: 700;
	}
	.last {
		font-size: 12px;
		color: var(--text-muted);
	}
	/* the value box: 44px, 1px while empty, 2px ink with a value, accent when out of range */
	.box {
		display: flex;
		align-items: center;
		height: 44px;
		padding: 0 10px;
		border: 1px solid var(--divider);
		background: var(--surface);
		cursor: text;
	}
	.box:not(.empty) {
		border: 2px solid var(--ink);
		padding: 0 9px;
		background: var(--bg);
	}
	.box.bad {
		border-color: var(--accent);
	}
	.box:focus-within {
		border: 2px solid var(--accent);
		padding: 0 9px;
		background: var(--bg);
	}
	.box input {
		width: 100%;
		min-width: 0;
		height: 100%;
		padding: 0;
		background: transparent;
		border: none;
		outline: none;
		text-align: right;
		font-size: 18px;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.box input::placeholder {
		color: var(--neutral-500);
		font-weight: 400;
	}
	/* the unit, then the flag ("✕ High") or the last reading */
	/* a kit's countdown in the flag (#21) */
	.flag .clock {
		font-size: 14px;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		color: var(--accent-text);
	}
	.flag {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
		font-size: 12px;
		line-height: 1.3;
	}
	.unit {
		color: var(--text-muted);
	}
	.st {
		font-weight: 800;
		white-space: nowrap;
	}
	.lastv {
		color: var(--text-muted);
		white-space: nowrap;
	}
	/* the whole flag beside an empty field is the tap target, 44px tall */
	.flag:has(> button.lastv) {
		position: relative;
		align-self: stretch;
		justify-content: center;
	}
	button.lastv {
		align-self: flex-start;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		text-align: left;
		text-decoration: underline dotted;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	button.lastv::after {
		content: '';
		position: absolute;
		inset: 0;
	}
	button.lastv:hover {
		color: var(--text);
	}
	.msg {
		font-size: 13px;
		font-weight: 600;
	}
	.msg.hard-hint {
		color: var(--text-muted);
	}
	.msg.hard-hint a {
		font-weight: 700;
	}
	/* "8 drops are about 143 ppm" and its one-tap fix */
	.msg.drops {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
		margin-top: 4px;
		font-weight: 500;
	}
	.use-ppm {
		min-height: 40px;
		padding: 0 14px;
		font-size: 13px;
	}
	.drops .or {
		flex-basis: 100%;
		font-size: 12px;
	}
	/* the flag is beside the field, so the full reading is for screen readers */
	.st-msg {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
	.edit-targets {
		font-weight: 600;
		color: var(--text-muted);
	}
	/* "6 more parameters · Phosphate, Potassium, …": a row like the others, the names muted */
	.later summary {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 2px;
		min-height: 52px;
		padding: 6px 0;
		border-bottom: 1px solid var(--divider);
		cursor: pointer;
		list-style: none;
	}
	.later summary::-webkit-details-marker {
		display: none;
	}
	.later-n {
		font-size: 14px;
		font-weight: 800;
		color: var(--accent-text);
	}
	.later-n::after {
		content: ' ▾';
	}
	.later[open] .later-n::after {
		content: ' ▴';
	}
	.later-names {
		font-size: 13px;
		color: var(--text-muted);
	}
	.add-param {
		display: flex;
		align-items: center;
		min-height: 44px;
		font-size: 14px;
		font-weight: 800;
		border-bottom: 1px solid var(--divider);
	}

	/* ── Note, photo, task ── */
	.note-row {
		display: flex;
		gap: 8px;
		margin-top: 14px;
		align-items: flex-start;
	}
	/* with photos, the note keeps the full width and the photos get their own row */
	.note-row:has(:global(.tile)) {
		flex-wrap: wrap;
	}
	.note-row:has(:global(.tile)) .note {
		flex-basis: 100%;
	}
	.note {
		flex: 1;
		min-width: 0;
	}
	.task-gap {
		margin-top: 12px;
	}

	/* ── Also log a water change: a block under a rule that opens up ── */
	.wc {
		margin-top: 14px;
		border-top: 2px solid var(--ink);
	}
	.wc-toggle {
		padding: 8px 0;
	}
	.wc-head {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.wc-title {
		font-size: 15px;
		font-weight: 700;
	}
	.wc-sub {
		font-size: 13px;
		color: var(--text-muted);
	}
	.wc-body {
		display: none;
		flex-direction: column;
		gap: 16px;
		padding: 4px 0 14px;
	}
	.wc.on .wc-body,
	.wc:has(.wc-toggle input:checked) .wc-body {
		display: flex;
	}
	.wc.on .wc-sub,
	.wc:has(.wc-toggle input:checked) .wc-sub {
		display: none;
	}

	.summary {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
	}

	@media (min-width: 1024px) {
		.line {
			grid-template-columns: minmax(0, 1fr) 100px 96px;
		}
		.note-row {
			gap: 10px;
		}
	}
</style>
