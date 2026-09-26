<script lang="ts">
	import { onMount, untrack } from 'svelte';
	// 05 / 08 / G6 · Water test form. Every field is optional; numeric keypad;
	// previous reading shown faintly; inline status as you type.
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { queueable } from '$lib/offline';
	import { clearDraft, logDraft, type Restored } from '$lib/draft';
	import ConfirmDelete from './ConfirmDelete.svelte';
	import CustomParamSheet from './CustomParamSheet.svelte';
	import { ui } from '$lib/ui.svelte';
	import DateTimePicker from './DateTimePicker.svelte';
	import PhotoPicker from './PhotoPicker.svelte';
	import { paramStatus, statusIcon, statusLong, statusMedium } from '$lib/status';
	import { parseNumber } from '$lib/units';
	import { whenLabel, type When } from '$lib/time';

	interface Param {
		id: string;
		name: string;
		unit: string;
		min: number | null;
		max: number | null;
		rangeText: string;
		last: string | null;
	}
	let {
		mode = 'new',
		tankName,
		params,
		values = {},
		initialNote = '',
		initialWhen = null,
		timeZone,
		closeHref,
		task = null,
		error = null,
		fieldErrors = {},
		meta = null,
		existingPhotos = [],
		previous = {},
		remove = null,
		ontankclick,
		targetsHref = null,
		draftKey = null
	}: {
		mode?: 'new' | 'edit';
		tankName: string;
		params: Param[];
		values?: Record<string, string>;
		initialNote?: string;
		initialWhen?: When | null;
		timeZone: string;
		closeHref: string;
		task?: { id: string; label: string; checked: boolean } | null;
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
		/** New tests: keep what was typed on this device until it's saved */
		draftKey?: string | null;
	} = $props();

	let draft = $state<Record<string, string>>(untrack(() => ({ ...values })));
	let saved = $state<Record<string, string>>(untrack(() => ({ ...values })));
	let note = $state(untrack(() => initialNote));
	let when = $state<When | null>(untrack(() => initialWhen));
	let picking = $state(false);
	// "+ Add parameter" opens G7 here, so the test in progress stays on screen
	let addOpen = $state(false);
	let clientId = $state('');
	let busy = $state(false);
	let desk = $state(false);
	onMount(() => {
		clientId = crypto.randomUUID();
		const mq = matchMedia('(min-width: 1024px)');
		const sync = () => (desk = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	const rows = $derived(
		params.map((p) => {
			const raw = draft[p.id] ?? '';
			const v = parseNumber(raw);
			const st = v == null ? null : paramStatus(v, { min: p.min, max: p.max });
			// "was": the saved value while it's being changed, else the value before the last edit
			const was = mode !== 'edit' ? null : (saved[p.id] ?? '') !== raw && saved[p.id] ? saved[p.id] : (previous[p.id] ?? null);
			// "Last 7.0 · Sep 18": the date only fits on phones (05 vs 08)
			const [lastValue, lastDate = ''] = (p.last ?? '').split(' · ');
			return { ...p, raw, v, st, was, lastValue, lastDate };
		})
	);
	const filled = $derived(rows.filter((r) => r.v != null).length);

	// A test that was left before it was saved comes back, with Discard.
	let restored = $state<{ readings: number; discard: () => Promise<void> } | null>(null);
	function onrestore(r: Restored) {
		if (r.date && r.time) when = { date: r.date, time: r.time };
		restored = {
			readings: filled,
			discard: async () => {
				restored = null;
				when = initialWhen;
				await r.discard();
			}
		};
	}
	const outOfRange = $derived(rows.filter((r) => r.st?.level === 'bad').length);
	const saveLabel = $derived(
		mode === 'edit' ? 'Save changes' : filled ? `Save ${filled} reading${filled === 1 ? '' : 's'}` : 'Save'
	);
	const taskText = $derived.by(() => {
		if (!task) return null;
		const m = task.label.match(/^(.*?)\s*(\(next due [^)]*\))$/);
		return m ? { main: m[1], next: m[2] } : { main: task.label, next: '' };
	});

	// "In range", "Near limit", "Above 5–20": after the icon in 08, 7.5 and G6
	function statusWord(r: (typeof rows)[number]) {
		if (!r.st) return '';
		if (r.st.level !== 'bad') return statusMedium(r.st).slice(2);
		const unit = r.unit ? ` ${r.unit}` : '';
		const range = (unit && r.rangeText.endsWith(unit) ? r.rangeText.slice(0, -unit.length) : r.rangeText).replace(/^[≤≥] /, '');
		return `${r.st.direction === 'high' ? 'Above' : 'Below'} ${range}`;
	}
	const shortStatus = (r: (typeof rows)[number]) => (r.st ? `${statusIcon[r.st.level]} ${statusWord(r)}` : '');

	function clean(id: string, e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const v = el.value.replace(',', '.').replace(/[^0-9.\-]/g, '');
		draft[id] = v;
		if (el.value !== v) el.value = v;
	}

	// The whole box is the tap target, also where the value doesn't reach.
	function focusField(e: MouseEvent) {
		if (!(e.target instanceof HTMLInputElement)) (e.currentTarget as HTMLElement).querySelector('input')?.focus();
	}
</script>

<form
	method="POST"
	enctype="multipart/form-data"
	class="tform"
	class:edit={mode === 'edit'}
	use:enhance={queueable({
		offline: mode === 'new',
		title: () => `Water test · ${filled} reading${filled === 1 ? '' : 's'}`,
		closeHref: () => closeHref,
		timeZone,
		busy: (b) => (busy = b),
		onsaved: () => draftKey && clearDraft(draftKey)
	})}
	use:logDraft={{ key: mode === 'new' ? draftKey : null, onrestore, watch: when }}
>
	<input type="hidden" name="clientId" value={clientId} />
	<input type="hidden" name="date" value={when?.date ?? ''} />
	<input type="hidden" name="time" value={when?.time ?? ''} />

	<div class="panel">
		<!-- phone: 05 / G6 top bar -->
		<header class="bar hide-desk">
			{#if mode === 'edit'}
				<a class="bar-text" href={closeHref}>Cancel</a>
			{:else}
				<a class="btn-icon close" href={closeHref} aria-label="Close">✕</a>
			{/if}
			<div class="title">
				<h1>{mode === 'edit' ? 'Edit water test' : 'Water test'}</h1>
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

		<!-- desktop: 08 header -->
		<header class="dhead hide-phone">
			<h1>{mode === 'edit' ? 'Edit water test' : 'Log water test'}</h1>
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
			{#if mode === 'new'}<p class="hint hide-desk">All fields optional. Previous reading shown for reference.</p>{/if}
			{#if error}<p class="banner banner-bad" role="alert">✕ {error}</p>{/if}
			{#if restored}
				<div class="draft-note" role="status">
					<span
						>▲ {restored.readings
							? `Restored ${restored.readings} unsaved reading${restored.readings === 1 ? '' : 's'}`
							: "Restored what you hadn't saved"}</span
					>
					<button type="button" class="btn-text" onclick={() => restored?.discard()}>Discard</button>
				</div>
			{/if}

			<div class="rows">
				{#each rows as r (r.id)}
					<div class="row">
						<div class="line">
							<label class="lbl" for="v_{r.id}">
								<span class="pname">{r.name}</span>
								<span class="last">
									{#if mode === 'edit'}
										{#if r.st}
											<span class="status-{r.st.level}"
												>{shortStatus(r)}{#if r.was}{' · '}<span class="was">was {r.was}</span>{/if}</span
											>
										{:else if r.was}
											<span class="was">was {r.was}</span>
										{/if}
									{:else if r.last}
										{r.lastValue}<span class="hide-desk">{' · '}{r.lastDate}</span>
									{:else}
										{r.rangeText ? `Target ${r.rangeText}` : 'No target'}
									{/if}
								</span>
							</label>
							<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
							<div
								class="box"
								class:empty={r.v == null}
								class:follow={mode === 'new' && r.v != null}
								class:warn={mode === 'new' && r.st?.level === 'warn'}
								class:bad={mode === 'new' && r.st?.level === 'bad'}
								onclick={focusField}
							>
								<input
									id="v_{r.id}"
									name="v_{r.id}"
									inputmode="decimal"
									autocomplete="off"
									placeholder="—"
									value={r.raw}
									oninput={(e) => clean(r.id, e)}
									aria-describedby={mode === 'new' && r.st ? `s_${r.id}` : undefined}
									aria-invalid={r.st?.level === 'bad' || !!fieldErrors[r.id]}
								/>
								{#if r.unit}<span class="unit">{r.unit}</span>{/if}
								{#if mode === 'new' && r.st}
									<span class="st status-{r.st.level}" aria-hidden="true"
										>{statusIcon[r.st.level]}<span class="st-word">{' '}{statusWord(r)}</span></span
									>
								{/if}
							</div>
						</div>
						{#if mode === 'new' && r.st}
							<!-- 05: under the field on phones; 08 shows it inside the field, so this is for screen readers there -->
							<div class="msg st-msg status-{r.st.level}" class:quiet={r.st.level === 'ok'} id="s_{r.id}">{statusLong(r.st, r.rangeText)}</div>
						{/if}
						{#if fieldErrors[r.id]}<div class="msg status-bad">✕ {fieldErrors[r.id]}</div>{/if}
					</div>
				{/each}
				{#if mode === 'new' && targetsHref}
					<a
						class="add-param hide-phone"
						href={targetsHref}
						onclick={(e) => {
							e.preventDefault();
							addOpen = true;
						}}
					>
						<span class="ap-label">+ Add parameter</span>
						<span class="ap-box" aria-hidden="true"></span>
					</a>
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
				<PhotoPicker compact existing={existingPhotos} />
			</div>

			{#if task && taskText}
				<label class="check-row task">
					<input type="checkbox" name="completeTask" value={task.id} defaultChecked={task.checked} />
					<span class="task-text"
						><span>{taskText.main}</span>{#if taskText.next}{' '}<span class="next">{taskText.next}</span>{/if}</span
					>
				</label>
			{/if}
		</div>

		<footer class="foot">
			{#if mode === 'new'}
				<span class="count">{filled} of {params.length} filled{outOfRange ? ` · ${outOfRange} out of range` : ''}</span>
			{:else}
				<span class="grow" aria-hidden="true"></span>
			{/if}
			<a class="btn cancel" href={closeHref}>Cancel</a>
			<button class="btn btn-primary save" disabled={busy}>{saveLabel}</button>
			{#if remove}<button type="button" class="remove" popovertarget="confirm-entry-delete">Delete entry</button>{/if}
		</footer>
	</div>
</form>

{#if remove}
	<ConfirmDelete id="confirm-entry-delete" trigger={false} title={remove.title} body={remove.body} action={remove.action} fields={{ from: ui.prev ?? '' }} />
{/if}

<DateTimePicker bind:open={picking} value={when} {timeZone} onselect={(v) => (when = v)} />

{#if mode === 'new' && targetsHref}
	<CustomParamSheet bind:open={addOpen} {tankName} action="{targetsHref}?/addCustom" onadded={() => invalidateAll()} />
{/if}

<style>
	.tform {
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

	/* ── Phone top bar (05, G6) ── */
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
		padding-bottom: 16px;
	}
	.meta {
		margin: 0 0 8px;
		padding: 10px 14px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		font-size: 13px;
		color: var(--text-muted);
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	.banner {
		margin: 10px 0 0;
	}

	/* ── Readings (05 rows) ── */
	.rows {
		padding-top: 10px;
		display: flex;
		flex-direction: column;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 9px 0;
		border-bottom: 1px solid var(--divider-soft);
	}
	.edit .row {
		padding: 8px 0;
	}
	.tform:not(.edit) .row:last-of-type {
		border-bottom: none;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.lbl {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.pname {
		font-size: 16px;
		font-weight: 600;
	}
	.last {
		font-size: 12px;
		color: var(--text-faint);
	}
	.box {
		width: 132px;
		height: 48px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 12px;
		border-radius: 12px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		cursor: text;
	}
	.edit .box {
		height: 46px;
	}
	.box.empty {
		background: var(--surface-2);
		border-style: dashed;
	}
	/* 2px states draw the second pixel inside, so the padding (and the value) never moves */
	.box:focus-within {
		border-style: solid;
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.box.warn {
		border-color: var(--warn);
		box-shadow: inset 0 0 0 1px var(--warn);
	}
	.box.bad {
		border-color: var(--bad);
		box-shadow: inset 0 0 0 1px var(--bad);
	}
	.box input {
		flex: 1;
		min-width: 0;
		height: 100%;
		padding: 0;
		background: transparent;
		border: none;
		outline: none;
		font-size: 20px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.edit .box input {
		font-size: 19px;
	}
	.box input::placeholder {
		font-weight: 400;
	}
	/* 05 / 08: the unit follows the value, the status sits at the end */
	@supports (field-sizing: content) {
		.box.follow input {
			flex: 0 1 auto;
			field-sizing: content;
		}
	}
	.unit {
		font-size: 12px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.box.empty .unit {
		color: var(--text-faint);
	}
	.st {
		margin-left: auto;
		padding-left: 4px;
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
	}
	.st-word {
		display: none;
	}
	.msg {
		font-size: 13px;
		font-weight: 600;
		text-align: right;
	}
	.msg.quiet {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	/* ── Note, photo, task ── */
	.note-row {
		display: flex;
		gap: 8px;
		margin-top: 12px;
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
		height: 48px;
		padding: 0 14px;
		font-size: 16px;
		background: transparent;
		border-color: var(--border-strong);
	}
	.note::placeholder {
		color: var(--text-muted);
	}
	.task {
		margin-top: 12px;
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

	/* ── Footer: sticky Save (05); G6 puts Save changes and Delete entry at the end ── */
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
	.count,
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
		.tform {
			min-height: 0;
			padding: 28px 32px;
			align-items: center;
		}
		.panel {
			width: 640px;
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
			padding: 22px 24px 16px;
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
		.meta {
			margin: 0 0 16px;
		}
		.banner {
			margin: 0 0 16px;
		}
		.rows {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 14px 20px;
			padding: 0;
		}
		.row,
		.edit .row,
		.tform:not(.edit) .row:last-of-type {
			border: none;
			padding: 0;
			gap: 4px;
		}
		.line {
			flex-direction: column;
			align-items: stretch;
			gap: 6px;
		}
		.lbl {
			flex-direction: row;
			justify-content: space-between;
			align-items: baseline;
			gap: 8px;
		}
		.pname,
		.last {
			font-size: 14px;
		}
		.last {
			text-align: right;
		}
		.box,
		.edit .box {
			width: 100%;
			height: 48px;
			padding: 0 14px;
			background: var(--surface-2);
		}
		.box.empty {
			background: var(--bg);
		}
		.box input,
		.edit .box input {
			font-size: 19px;
		}
		.unit,
		.st {
			font-size: 13px;
		}
		.st-word {
			display: inline;
		}
		/* the status is inside the field (08), so the message is for screen readers only */
		.st-msg {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
		}
		.msg {
			text-align: left;
		}
		.add-param {
			display: flex;
			flex-direction: column;
			gap: 6px;
			color: var(--text-muted);
		}
		.ap-label {
			font-size: 14px;
			font-weight: 600;
		}
		.ap-box {
			height: 48px;
			border-radius: 12px;
			border: 1px dashed var(--border);
		}
		.add-param:hover {
			color: var(--accent);
		}
		.add-param:hover .ap-box {
			border-color: var(--accent);
		}
		.note-row {
			margin-top: 14px;
			gap: 10px;
		}
		.note {
			font-size: 15px;
		}
		.task {
			margin-top: 14px;
			background: var(--surface-2);
		}
		.foot,
		.edit .foot {
			position: sticky;
			bottom: 0;
			margin: 0;
			padding: 16px 24px 22px;
			flex-direction: row;
			align-items: center;
			gap: 12px;
			border-top: 1px solid var(--border);
			background: var(--surface);
		}
		.count,
		.grow {
			display: block;
			flex: 1;
			font-size: 14px;
			color: var(--text-muted);
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
