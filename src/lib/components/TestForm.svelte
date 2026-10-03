<script lang="ts">
	import { onMount, untrack } from 'svelte';
	// 05 / 08 / G6 · Water test form. Every field is optional; numeric keypad;
	// previous reading shown faintly; inline status as you type. New tests can
	// start from the last readings and log a water change alongside.
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { queueable } from '$lib/offline';
	import { clearDraft, logDraft, type Restored } from '$lib/draft';
	import ConfirmDelete from './ConfirmDelete.svelte';
	import CustomParamSheet from './CustomParamSheet.svelte';
	import { ui } from '$lib/ui.svelte';
	import DateTimePicker from './DateTimePicker.svelte';
	import PhotoPicker from './PhotoPicker.svelte';
	import Tip from './Tip.svelte';
	import WaterChangeFields from './WaterChangeFields.svelte';
	import { WATER_SOURCES } from '$lib/events';
	import { paramStatus, statusIcon, statusLong, statusMedium, statusShort } from '$lib/status';
	import { dropsAsPpm, parseNumber } from '$lib/units';
	import { whenLabel, type When } from '$lib/time';

	interface Param {
		id: string;
		/** gh, kh… (the hardness hints need it) */
		key?: string;
		name: string;
		unit: string;
		min: number | null;
		max: number | null;
		rangeText: string;
		last: string | null;
		lastInput?: string | null;
		/** what the parameter is (ⓘ), for standard ones */
		tip?: string | null;
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
		reusable = [],
		draftKey = null,
		waterChange = null
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
		/** custom parameters from other tanks, offered by "+ Add parameter" */
		reusable?: { name: string; unit: string; min: number | null; max: number | null; decimals: number; tank: string }[];
		/** New tests: keep what was typed on this device until it's saved */
		draftKey?: string | null;
		/** New tests: "Also log a water change", on when the last test had one */
		waterChange?: {
			on: boolean;
			amountMode: string;
			amount: string;
			source: string;
			task: { id: string; label: string; checked: boolean } | null;
			volUnit: string;
			tankVolume: number | null;
			tankVolumeIsActual: boolean;
		} | null;
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
			// GH and KH: drop kits count degrees, 1 drop = 1°
			const hard = p.key === 'gh' || p.key === 'kh';
			const degrees = hard && /^d[GK]H$/.test(p.unit);
			// in ppm, a small 7 or a round 80 reads like drops (a degree is ~17.9 ppm): offer the ppm
			const drops = hard && !degrees ? dropsAsPpm(v) : null;
			return { ...p, raw, v, st, was, lastValue, lastDate, degrees, drops };
		})
	);
	const filled = $derived(rows.filter((r) => r.v != null).length);

	// the other log types, with the tank and time this one has (README § 11)
	const typeHref = (category: string) => {
		const q = new URLSearchParams();
		for (const k of ['tank', 'date', 'time']) {
			const v = page.url.searchParams.get(k);
			if (v) q.set(k, v);
		}
		q.set('category', category);
		return `/entries/event/new?${q}`;
	};
	function clearAll() {
		for (const p of params) draft[p.id] = '';
		copied = null;
	}
	// "▲ Nitrate is above target. Saving adds it to Needs attention.", before Save
	const names = (xs: { name: string }[]) =>
		xs.length <= 2 ? xs.map((x) => x.name).join(' and ') : `${xs.slice(0, -1).map((x) => x.name).join(', ')} and ${xs.at(-1)!.name}`;
	const summary = $derived.by(() => {
		if (mode !== 'new') return '';
		const bad = rows.filter((r) => r.st?.level === 'bad');
		const warn = rows.filter((r) => r.st?.level === 'warn');
		if (bad.length) {
			const one = bad.length === 1;
			const how = one ? (bad[0].st?.direction === 'high' ? 'above' : 'below') + ' target' : 'out of range';
			return `▲ ${names(bad)} ${one ? 'is' : 'are'} ${how}. Saving adds ${one ? 'it' : 'them'} to Needs attention.`;
		}
		if (warn.length) return `▲ ${names(warn)} ${warn.length === 1 ? 'is' : 'are'} near a limit.`;
		return '';
	});

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
	const wcSummary = $derived(
		`${wcAmount || '–'}${wcMode === 'percent' ? '%' : ` ${waterChange?.volUnit ?? ''}`} · ${WATER_SOURCES.find((s) => s.value === wcSource)?.label ?? ''}`
	);
	const withWc = $derived(mode === 'new' && !!waterChange && wcOn);

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
		mode === 'edit'
			? 'Save changes'
			: filled
				? `Save ${filled} reading${filled === 1 ? '' : 's'}${withWc ? ' + water change' : ''}`
				: 'Save'
	);
	// "Also complete task “Water test” (next due Oct 3)": the date on its own line
	function splitTask(t: { label: string } | null | undefined) {
		if (!t) return null;
		const m = t.label.match(/^(.*?)\s*(\(next due [^)]*\))$/);
		return m ? { main: m[1], next: m[2] } : { main: t.label, next: '' };
	}
	const taskText = $derived(splitTask(task));
	const wcTaskText = $derived(splitTask(waterChange?.task));

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
		title: () => `Water test · ${filled} reading${filled === 1 ? '' : 's'}${withWc ? ' + water change' : ''}`,
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
		<header class="top">
			<div class="kick">
				<button type="button" class="kicker tank" onclick={() => ontankclick?.()} disabled={!ontankclick}
					>{mode === 'edit' ? 'Edit' : 'Log for'} {tankName}{#if ontankclick}<span aria-hidden="true"> ▾</span>{/if}</button
				>
				<a class="btn-icon close" href={closeHref} aria-label="Close">✕</a>
			</div>
			{#if mode === 'new'}
				<!-- the type: this one, and the others as links (README § 11) -->
				<nav class="types" aria-label="Log type">
					<span class="ty on" aria-current="page">Test<kbd>T</kbd></span>
					<a class="ty" href={typeHref('water_change')}>Water change<kbd>W</kbd></a>
					<a class="ty" href={typeHref('dosing')}>Dose<kbd>D</kbd></a>
					<a class="ty" href={typeHref('note')}>Note<kbd>N</kbd></a>
					<a class="ty" href={typeHref('maintenance')}>More</a>
				</nav>
			{/if}
			<div class="trow">
				<h1>{mode === 'edit' ? 'Edit water test' : 'Log water test'}</h1>
				<button type="button" class="when" onclick={() => (picking = true)}><span class="when-k">When </span><b>{whenLabel(when)}</b><span class="when-c"> ▾</span></button>
			</div>
		</header>

		<div class="body">
			{#if meta}<p class="meta">{meta}</p>{/if}
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
				{#each rows as r (r.id)}
					<div class="row">
						<div class="line">
							<!-- the name is the field's label; the target or "Last 7.0" describes it -->
							<div class="lbl">
								<span class="pline"
									><label class="pname" for="v_{r.id}">{r.name}</label>{#if r.tip}<Tip text={r.tip} label="About {r.name}" />{/if}</span
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
									autocomplete="off"
									placeholder="–"
									value={r.raw}
									oninput={(e) => clean(r.id, e)}
									aria-describedby={[`last_${r.id}`, mode === 'new' && r.st ? `s_${r.id}` : ''].filter(Boolean).join(' ')}
									aria-invalid={r.st?.level === 'bad' || !!fieldErrors[r.id]}
								/>
							</div>
							<div class="flag">
								{#if r.unit}<span class="unit">{r.unit}</span>{/if}
								{#if mode === 'new' && r.st}
									<span class="st status-{r.st.level}" aria-hidden="true">{r.st.level === 'ok' ? '✓' : statusShort(r.st)}</span>
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
				{/each}
				{#if mode === 'new' && targetsHref}
					<a
						class="add-param"
						href={targetsHref}
						onclick={(e) => {
							e.preventDefault();
							addOpen = true;
						}}>+ Add parameter</a
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
						{#if waterChange.task && wcTaskText}
							<label class="check-row wc-task">
								<input type="checkbox" name="wcCompleteTask" value={waterChange.task.id} defaultChecked={waterChange.task.checked} />
								<span class="task-text"
									><span>{wcTaskText.main}</span>{#if wcTaskText.next}{' '}<span class="next">{wcTaskText.next}</span>{/if}</span
								>
							</label>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<footer class="foot">
			{#if summary}<p class="summary status-warn" aria-live="polite">{summary}</p>{/if}
			<div class="foot-line">
				{#if mode === 'new'}
					<span class="count">{filled} of {params.length} filled{outOfRange ? ` · ${outOfRange} out of range` : ''}</span>
				{:else}
					<span class="grow" aria-hidden="true"></span>
				{/if}
				{#if remove}<button type="button" class="btn btn-danger remove" popovertarget="confirm-entry-delete">Delete entry</button>{/if}
				<a class="btn cancel" href={closeHref}>Cancel</a>
				<button class="btn btn-primary save" disabled={busy}>{saveLabel}</button>
			</div>
		</footer>
	</div>
</form>

{#if remove}
	<ConfirmDelete id="confirm-entry-delete" trigger={false} title={remove.title} body={remove.body} action={remove.action} fields={{ from: ui.prev ?? '' }} />
{/if}

<DateTimePicker bind:open={picking} value={when} {timeZone} onselect={(v) => (when = v)} />

{#if mode === 'new' && targetsHref}
	<CustomParamSheet bind:open={addOpen} {tankName} {reusable} action="{targetsHref}?/addCustom" onadded={() => invalidateAll()} />
{/if}

<style>
	/* a field scrolled or tabbed to stays clear of the sticky Save bar */
	:global(html:has(.tform)) {
		scroll-padding-bottom: 132px;
	}
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

	/* ── Head: the tank, the type, the title and when ── */
	.top {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 10px 0 12px;
		border-bottom: 2px solid var(--divider);
	}
	.kick {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.tank {
		min-height: 44px;
		text-align: left;
	}
	.tank:disabled {
		cursor: default;
	}
	.close {
		margin-right: -12px;
		color: var(--accent);
		font-size: 16px;
	}
	/* the types: one bordered row, this one filled accent */
	.types {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		scrollbar-width: none;
		margin: 0 -20px;
		padding: 0 20px;
	}
	.types::-webkit-scrollbar {
		display: none;
	}
	.ty {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 0 12px;
		border: 1px solid var(--divider);
		color: var(--text);
		font-size: 13px;
		font-weight: 700;
		white-space: nowrap;
	}
	.ty.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
		font-weight: 800;
	}
	.ty kbd {
		display: none;
		font-family: inherit;
		font-size: 11px;
		font-weight: 400;
		opacity: 0.65;
	}
	.trow {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	h1 {
		margin: 0;
		font-size: 22px;
		min-width: 0;
	}
	.when {
		flex-shrink: 0;
		min-height: 44px;
		font-size: 13px;
		white-space: nowrap;
		text-align: right;
	}
	.when-k {
		color: var(--text-muted);
		margin-right: 6px;
	}

	.body {
		display: flex;
		flex-direction: column;
		padding-bottom: 16px;
	}
	.meta {
		margin: 12px 0 0;
		padding: 10px 14px;
		background: var(--surface);
		font-size: 13px;
		color: var(--text-muted);
	}
	.banner,
	.draft-note {
		margin: 12px 0 0;
	}
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
	.task {
		margin-top: 12px;
		padding: 10px 0;
		border-top: 1px solid var(--divider);
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
		line-height: 1.4;
	}
	.next {
		display: block;
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
	.wc-task {
		font-size: 14px;
		line-height: 1.4;
	}

	/* ── Footer: the warning, then Save, sticky on phones ── */
	.foot {
		position: sticky;
		bottom: 0;
		z-index: 2;
		margin: auto -20px 0;
		padding: 12px 20px calc(24px + env(safe-area-inset-bottom));
		background: var(--bg);
		border-top: 2px solid var(--divider);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.summary {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
	}
	.foot-line {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.count,
	.grow,
	.cancel {
		display: none;
	}
	.save {
		flex: 1;
		min-height: 52px;
		font-size: 16px;
	}
	.remove {
		min-height: 52px;
	}

	@media (min-width: 1024px) {
		:global(html:has(.tform)) {
			scroll-padding-bottom: 96px;
		}
		.tform {
			min-height: 0;
			padding: 20px 32px 32px;
		}
		.panel {
			width: 600px;
			max-width: 100%;
			flex: none;
			padding: 0;
		}
		.top {
			padding: 0 0 14px;
		}
		.ty kbd {
			display: inline;
		}
		.line {
			grid-template-columns: minmax(0, 1fr) 100px 96px;
		}
		.note-row {
			gap: 10px;
		}
		.foot {
			position: sticky;
			bottom: 0;
			margin: 0;
			padding: 12px 0 0;
			border-top: 2px solid var(--divider);
		}
		.count,
		.grow {
			display: block;
			flex: 1;
			font-size: 13px;
			color: var(--text-muted);
		}
		.cancel {
			display: inline-flex;
		}
		.save {
			flex: none;
			min-height: 44px;
			font-size: 14px;
			padding: 0 20px;
		}
		.remove {
			min-height: 40px;
			order: -1;
		}
	}
</style>
