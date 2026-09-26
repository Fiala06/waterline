<script lang="ts">
	import { untrack } from 'svelte';
	// 05 / 08 / G6 · Water test form. Every field is optional; numeric keypad;
	// previous reading shown faintly; inline status as you type.
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
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
		ontankclick
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
		ontankclick?: () => void;
	} = $props();

	let draft = $state<Record<string, string>>(untrack(() => ({ ...values })));
	let saved = $state<Record<string, string>>(untrack(() => ({ ...values })));
	let note = $state(untrack(() => initialNote));
	let when = $state<When | null>(untrack(() => initialWhen));
	let picking = $state(false);
	let clientId = $state('');
	let busy = $state(false);
	onMount(() => (clientId = crypto.randomUUID()));

	const rows = $derived(
		params.map((p) => {
			const raw = draft[p.id] ?? '';
			const v = parseNumber(raw);
			const st = v == null ? null : paramStatus(v, { min: p.min, max: p.max });
			const was = mode === 'edit' && (saved[p.id] ?? '') !== raw && saved[p.id] ? saved[p.id] : null;
			return { ...p, raw, v, st, was };
		})
	);
	const filled = $derived(rows.filter((r) => r.v != null).length);
	const outOfRange = $derived(rows.filter((r) => r.st?.level === 'bad').length);
	const saveLabel = $derived(
		mode === 'edit' ? 'Save changes' : filled ? `Save ${filled} reading${filled === 1 ? '' : 's'}` : 'Save'
	);

	// G6: "✓ In range", "▲ Near limit", "✕ Above 5–20 · was 40"
	function editLabel(r: (typeof rows)[number]) {
		if (!r.st) return '';
		const base =
			r.st.level === 'bad'
				? `✕ ${r.st.direction === 'high' ? 'Above' : 'Below'} ${r.rangeText.replace(/ [^ ]+$/, '')}`
				: statusMedium(r.st);
		return r.was ? `${base} · was ${r.was}` : base;
	}

	function clean(id: string, e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const v = el.value.replace(',', '.').replace(/[^0-9.\-]/g, '');
		draft[id] = v;
		if (el.value !== v) el.value = v;
	}
</script>

<form
	method="POST"
	enctype="multipart/form-data"
	class="tform"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<input type="hidden" name="clientId" value={clientId} />
	<input type="hidden" name="date" value={when?.date ?? ''} />
	<input type="hidden" name="time" value={when?.time ?? ''} />

	<div class="panel">
		<header class="head">
			<a class="btn-icon close" href={closeHref} aria-label="Close">✕</a>
			<div class="title">
				<h1>{mode === 'edit' ? 'Edit water test' : 'Water test'}</h1>
				<button type="button" class="sub" onclick={() => (picking = true)}>
					{tankName} · {whenLabel(when)} ▾
				</button>
			</div>
			<div class="d-chips">
				<button type="button" class="chip chip-pill" onclick={() => ontankclick?.()} disabled={!ontankclick}
					>{tankName} <span class="caret">▾</span></button
				>
				<button type="button" class="chip chip-pill when" onclick={() => (picking = true)}
					>{whenLabel(when)} <span class="caret">▾</span></button
				>
			</div>
			<span class="spacer" aria-hidden="true"></span>
		</header>

		{#if meta}<p class="meta">{meta}</p>{/if}
		<p class="hint">All fields optional. Previous reading shown for reference.</p>
		{#if error}<p class="banner banner-bad" role="alert">✕ {error}</p>{/if}

		<div class="rows">
			{#each rows as r (r.id)}
				<div class="row">
					<div class="line">
						<label class="lbl" for="v_{r.id}">
							<span class="pname">{r.name}</span>
							<span class="last">
								{#if mode === 'edit' && r.st}
									<span class="status-{r.st.level} strong">{editLabel(r)}</span>
								{:else}
									{r.last ?? (r.rangeText ? `Target ${r.rangeText}` : 'No target')}
								{/if}
							</span>
						</label>
						<div class="box" class:empty={r.v == null} class:ok={r.st?.level === 'ok'} class:warn={r.st?.level === 'warn'} class:bad={r.st?.level === 'bad'}>
							<input
								id="v_{r.id}"
								name="v_{r.id}"
								inputmode="decimal"
								autocomplete="off"
								placeholder="—"
								value={r.raw}
								oninput={(e) => clean(r.id, e)}
								aria-describedby={r.st && r.st.level !== 'ok' ? `s_${r.id}` : undefined}
								aria-invalid={r.st?.level === 'bad' || !!fieldErrors[r.id]}
							/>
							{#if r.unit}<span class="unit">{r.unit}</span>{/if}
							{#if r.st}
								<span class="icon status-{r.st.level}" aria-hidden="true">{statusIcon[r.st.level]}</span>
							{/if}
						</div>
					</div>
					{#if r.st && (r.st.level === 'bad' || r.st.level === 'warn') && mode !== 'edit'}
						<div class="msg status-{r.st.level}" id="s_{r.id}">{statusLong(r.st, r.rangeText)}</div>
					{/if}
					{#if fieldErrors[r.id]}<div class="msg status-bad">✕ {fieldErrors[r.id]}</div>{/if}
				</div>
			{/each}
		</div>

		<div class="note-row">
			<input class="input note" name="note" bind:value={note} maxlength="2000" placeholder="Add note, e.g. before water change" aria-label="Note" />
			<PhotoPicker compact existing={existingPhotos} />
		</div>

		{#if task}
			<label class="check-row">
				<input type="checkbox" name="completeTask" value={task.id} defaultChecked={task.checked} />
				<span>{task.label}</span>
			</label>
		{/if}

		<footer class="foot">
			<span class="count"
				>{filled} of {params.length} filled{outOfRange ? ` · ${outOfRange} out of range` : ''}</span
			>
			<a class="btn cancel" href={closeHref}>Cancel</a>
			<button class="btn btn-primary save" disabled={busy}>{saveLabel}</button>
		</footer>
	</div>
</form>

<DateTimePicker bind:open={picking} value={when} {timeZone} onselect={(v) => (when = v)} />

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
		font-size: 12px;
		color: var(--text-muted);
		min-height: 24px;
	}
	.spacer {
		width: 44px;
	}
	.d-chips {
		display: none;
	}
	.meta {
		margin: 0 0 4px;
		font-size: 13px;
		color: var(--text-faint);
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	.banner {
		margin: 10px 0 0;
	}
	.rows {
		padding-top: 6px;
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
	.strong {
		font-weight: 600;
	}
	.box {
		width: 140px;
		height: 48px;
		border-radius: 12px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 11px;
		flex-shrink: 0;
	}
	.box.empty {
		background: var(--surface-2);
		border-style: dashed;
	}
	.box:focus-within {
		border: 2px solid var(--accent);
		border-style: solid;
		padding: 0 10px;
	}
	.box.warn {
		border: 2px solid var(--warn);
		padding: 0 10px;
	}
	.box.bad {
		border: 2px solid var(--bad);
		padding: 0 10px;
	}
	.box input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		font-size: 20px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.box input::placeholder {
		font-weight: 400;
	}
	.unit {
		font-size: 12px;
		color: var(--text-muted);
	}
	.icon {
		font-size: 12px;
		font-weight: 600;
		margin-left: 2px;
	}
	.msg {
		font-size: 13px;
		font-weight: 600;
		text-align: right;
	}
	.note-row {
		display: flex;
		gap: 8px;
		margin-top: 12px;
		align-items: flex-start;
	}
	.note {
		flex: 1;
		min-width: 0;
		height: 48px;
		font-size: 15px;
		background: transparent;
		border-color: var(--border-strong);
	}
	.check-row {
		margin-top: 10px;
	}
	.foot {
		position: sticky;
		bottom: 0;
		margin: 16px -20px 0;
		padding: 14px 20px calc(28px + env(safe-area-inset-bottom));
		background: var(--bg);
		border-top: 1px solid var(--divider-soft);
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: auto;
	}
	.count,
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
		.tform {
			min-height: 0;
			padding: 32px;
			align-items: center;
		}
		.panel {
			width: 640px;
			flex: none;
			border-radius: 20px;
			background: var(--surface);
			border: 1px solid var(--border-strong);
			box-shadow: var(--shadow-modal);
			padding: 0;
		}
		.head {
			padding: 22px 24px 16px;
			border-bottom: 1px solid var(--border);
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
		.sub,
		.spacer {
			display: none;
		}
		.d-chips {
			display: flex;
			gap: 8px;
		}
		.d-chips .chip {
			height: 36px;
		}
		.when {
			font-weight: 400;
		}
		.meta,
		.hint,
		.banner {
			padding: 0 24px;
			margin-top: 14px;
		}
		.banner {
			margin: 14px 24px 0;
			padding: 12px 14px;
		}
		.rows {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 14px 20px;
			padding: 16px 24px 0;
		}
		.row {
			border: none;
			padding: 0;
		}
		.line {
			flex-direction: column;
			align-items: stretch;
			gap: 6px;
		}
		.lbl {
			flex-direction: row;
			justify-content: space-between;
			font-size: 14px;
		}
		.pname {
			font-size: 14px;
		}
		.last {
			font-size: 14px;
		}
		.box {
			width: 100%;
			padding: 0 14px;
		}
		.box.warn,
		.box.bad,
		.box:focus-within {
			padding: 0 13px;
		}
		.box input {
			font-size: 19px;
		}
		.unit {
			font-size: 13px;
		}
		.icon {
			font-size: 13px;
		}
		.msg {
			text-align: left;
		}
		.note-row,
		.check-row {
			margin: 14px 24px 0;
			width: auto;
		}
		.foot {
			position: static;
			margin: 20px 0 0;
			padding: 16px 24px 22px;
			border-top: 1px solid var(--border);
			background: transparent;
		}
		.count {
			display: block;
			flex: 1;
			font-size: 14px;
			color: var(--text-muted);
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
