<script lang="ts">
	// The frame the two log forms share (#263): TestForm and EventForm pass in
	// their fields. It owns the posting (queued offline, kept as a draft until
	// saved), the hidden fields, the head (tank, type chips, title, When), the
	// draft banner, the photo's date, the reminder's check-row, Save and Delete.
	import { onMount, type Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { queueable } from '$lib/offline';
	import { clearDraft, logDraft, type Restored } from '$lib/draft';
	import { ui } from '$lib/ui.svelte';
	import { fmtWhenShort, type ExifDate } from '$lib/exif';
	import { whenLabel, type When } from '$lib/time';
	import type { ReminderTask } from '$lib/tasks';
	import ConfirmDelete from './ConfirmDelete.svelte';
	import DateTimePicker from './DateTimePicker.svelte';
	import { chipScrollLeft, photoOtherDay, restoredText, splitTask, type LogType } from './entry-form';

	let {
		class: cls,
		layout,
		mode,
		tankName,
		ontankclick,
		types = null,
		title,
		when = $bindable(null),
		initialWhen,
		timeZone,
		closeHref,
		returnTo = null,
		draftKey = null,
		queueTitle,
		restoredReadings,
		meta = null,
		error = null,
		task = null,
		summary = '',
		footNote = null,
		remove = null,
		saveLabel,
		fields,
		beforeTask,
		afterTask
	}: {
		/** the form's own class, for its own styles (tform, eform) */
		class: string;
		/**
		 * 'rows': the test's reading rows, notices close above them, the photo's
		 * date full width and Delete entry first on desktop; 'fields': an event's
		 * labelled fields 18px apart, notices above them.
		 */
		layout: 'rows' | 'fields';
		mode: 'new' | 'edit';
		tankName: string;
		ontankclick?: () => void;
		/** the type chips, new entries only (README § 11) */
		types?: LogType[] | null;
		title: string;
		when?: When | null;
		/** where Discard on a restored draft puts When back */
		initialWhen: When | null;
		timeZone: string;
		closeHref: string;
		/** where saving goes back to (a page in the app), instead of the dashboard */
		returnTo?: string | null;
		/** new entries: keep what was typed on this device until it's saved */
		draftKey?: string | null;
		/** what the offline queue calls the entry */
		queueTitle: () => string;
		/** the test: how many readings a restored draft brought back */
		restoredReadings?: () => number;
		meta?: string | null;
		error?: string | null;
		/** the reminder this entry can mark done, with where it stands (from the entry's day) */
		task?: { id: string; label: string; sub?: string; checked: boolean; schedule?: ReminderTask; today?: string } | null;
		/** a warning above Save */
		summary?: string;
		/** desktop: beside Save ("3 of 7 filled") */
		footNote?: string | null;
		/** edit mode: the entry's delete action and its confirmation (G6 "Delete entry") */
		remove?: { action: string; title: string; body: string } | null;
		saveLabel: string;
		/** the form's fields, up to and with its PhotoPicker (give it `onphotos` as `ontaken`) */
		fields: Snippet<[onphotos: (dates: (ExifDate | null)[]) => void]>;
		/** after the photo's date, before the reminder's check-row */
		beforeTask?: Snippet;
		/** after the reminder's check-row */
		afterTask?: Snippet;
	} = $props();

	let picking = $state(false);
	let clientId = $state('');
	let busy = $state(false);
	onMount(() => (clientId = crypto.randomUUID()));

	// A photo taken on another day than the entry (#42): offer its date, without changing the entry by itself.
	let photoDates = $state<(ExifDate | null)[]>([]);
	const photoWhen = $derived(photoOtherDay(photoDates, when, timeZone));

	// An entry that was left before it was saved comes back, with Discard.
	let restored = $state<{ text: string; discard: () => Promise<void> } | null>(null);
	function onrestore(r: Restored) {
		if (r.date && r.time) when = { date: r.date, time: r.time };
		restored = {
			text: restoredText(restoredReadings?.()),
			discard: async () => {
				restored = null;
				when = initialWhen;
				await r.discard();
			}
		};
	}

	// "Also mark the reminder “Water test” done", with where it stands on its own line
	const taskText = $derived(splitTask(task, when?.date));

	// The type chips are one row that scrolls sideways: bring this one into it.
	function showOn(row: HTMLElement) {
		const show = () => {
			const on = row.querySelector<HTMLElement>('.on');
			if (!on) return;
			const r = row.getBoundingClientRect();
			const c = on.getBoundingClientRect();
			row.scrollLeft = chipScrollLeft(c.left - r.left + row.scrollLeft, c.width, row.clientWidth, parseFloat(getComputedStyle(row).paddingRight) || 0);
		};
		show();
		// again once Archivo has loaded, as the chips' widths change with it
		void document.fonts?.ready.then(show);
	}
</script>

<form
	method="POST"
	enctype="multipart/form-data"
	class="log-form {cls}"
	class:edit={mode === 'edit'}
	use:enhance={queueable({
		offline: mode === 'new',
		title: queueTitle,
		closeHref: () => closeHref,
		timeZone,
		busy: (b) => (busy = b),
		onsaved: () => draftKey && clearDraft(draftKey)
	})}
	use:logDraft={{ key: mode === 'new' ? draftKey : null, onrestore, watch: when }}
>
	{#if returnTo}<input type="hidden" name="from" value={returnTo} />{/if}
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
			{#if mode === 'new' && types}
				<!-- the type: this one, and the others as links (README § 11) -->
				<nav class="types" aria-label="Log type" use:showOn>
					{#each types as t (t.label)}
						{#if t.on && !t.href}
							<span class="ty on" aria-current="page">{t.label}{#if t.key}<kbd aria-hidden="true">{t.key}</kbd>{/if}</span>
						{:else}
							<a class="ty" class:on={t.on} aria-current={t.on ? 'page' : undefined} href={t.href}
								>{t.label}{#if t.key}<kbd aria-hidden="true">{t.key}</kbd>{/if}</a
							>
						{/if}
					{/each}
				</nav>
			{/if}
			<div class="trow">
				<h1>{title}</h1>
				<button type="button" class="when" onclick={() => (picking = true)}><span class="when-k">When</span>{' '}<b>{whenLabel(when)}</b>{' '}<span class="when-c">▾</span></button>
			</div>
		</header>

		<div class="body layout-{layout}">
			{#if meta}<p class="meta">{meta}</p>{/if}
			{#if error}<p class="banner banner-bad" role="alert">✕ {error}</p>{/if}
			{#if restored}
				<div class="draft-note" role="status">
					<span>▲ {restored.text}</span>
					<button type="button" class="btn-text" onclick={() => restored?.discard()}>Discard</button>
				</div>
			{/if}

			<div class="fields">
				{@render fields((d) => (photoDates = d))}
				{#if photoWhen}
					<button type="button" class="btn-text photo-date" onclick={() => (when = photoWhen)}>Use the photo's date ({fmtWhenShort(photoWhen)})</button>
				{/if}
				{@render beforeTask?.()}
				{#if task && taskText}
					{#key task.id}
						<label class="check-row task">
							<input type="checkbox" name="completeTask" value={task.id} defaultChecked={task.checked} />
							<span class="task-text"
								><span>{taskText.main}</span>{#if taskText.next}{' '}<span class="next">{taskText.next}</span>{/if}</span
							>
						</label>
					{/key}
				{/if}
				{@render afterTask?.()}
			</div>
		</div>

		<footer class="foot layout-{layout}">
			{#if summary}<p class="summary status-warn" aria-live="polite">{summary}</p>{/if}
			<div class="foot-line">
				{#if footNote != null}
					<span class="count">{footNote}</span>
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

<DateTimePicker bind:open={picking} value={when} {timeZone} onselect={(w) => (when = w)} />

<style>
	.log-form {
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
		color: var(--accent-text);
		font-size: 16px;
	}
	/* the types: one bordered row that scrolls sideways (the redesign's one row), this one filled accent */
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

	/* ── Body: notices, then the form's fields ── */
	.body,
	.fields {
		display: flex;
		flex-direction: column;
	}
	.body.layout-rows {
		padding-bottom: 16px;
	}
	.body.layout-fields {
		padding: 16px 0 20px;
	}
	.meta {
		padding: 10px 14px;
		background: var(--surface);
		font-size: 13px;
		color: var(--text-muted);
	}
	.layout-rows .meta,
	.layout-rows .banner,
	.layout-rows .draft-note {
		margin: 12px 0 0;
	}
	.layout-fields .meta,
	.layout-fields .banner,
	.layout-fields .draft-note {
		margin: 0 0 16px;
	}
	.layout-fields .fields {
		gap: 18px;
	}
	/* "Use the photo's date (Sep 14, 3:20 PM)" under the photos (#42) */
	.layout-fields .photo-date {
		align-self: flex-start;
		font-size: 14px;
		min-height: 32px;
		padding: 0;
	}

	/* ── The reminder: "Also mark … done" ── */
	.task {
		padding: 10px 0;
		border-top: 1px solid var(--divider);
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
		line-height: 1.4;
	}
	.layout-rows .task {
		margin-top: 12px;
	}
	.next {
		display: block;
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
		.log-form {
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
		/* the row ends with the column, not past it */
		.types {
			margin: 0;
			padding: 0;
		}
		.ty kbd {
			display: inline;
		}
		.foot {
			margin: 0;
			padding: 12px 0 0;
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
		}
		/* the test: Delete entry at the start */
		.foot.layout-rows .remove {
			order: -1;
		}
	}
</style>
