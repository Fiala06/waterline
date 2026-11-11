<script lang="ts">
	// The frame every log form shares (#263): the form and its offline queue and
	// draft, the head (tank, type chips, title, When), the notices, the sticky
	// footer with Delete entry, Cancel and Save, and the date picker. The form's
	// own fields are its children.
	import { onMount, untrack, type Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { queueable } from '$lib/offline';
	import { clearDraft, logDraft, type Restored } from '$lib/draft';
	import { LOG_TYPES } from '$lib/events';
	import { whenLabel, type When } from '$lib/time';
	import { ui } from '$lib/ui.svelte';
	import type { EventCategory } from '$lib/types';
	import ConfirmDelete from './ConfirmDelete.svelte';
	import DateTimePicker from './DateTimePicker.svelte';

	let {
		mode = 'new',
		current,
		typeHref = null,
		tankName,
		title,
		when = $bindable(null),
		timeZone,
		closeHref,
		returnTo = null,
		saveLabel,
		queueTitle,
		draftKey = null,
		restoredLabel = () => "Restored what you hadn't saved",
		meta = null,
		error = null,
		remove = null,
		ontankclick,
		children,
		footNote,
		footInfo
	}: {
		mode?: 'new' | 'edit';
		/** the type this form logs, marked in the type chips */
		current: 'test' | EventCategory;
		/** New entries: where each type chip leads (README § 11), keeping this one's tank and time */
		typeHref?: ((t: 'test' | EventCategory) => string) | null;
		tankName: string;
		title: string;
		when?: When | null;
		timeZone: string;
		closeHref: string;
		/** where saving goes back to (a page in the app), instead of the dashboard */
		returnTo?: string | null;
		saveLabel: string;
		/** the entry's name in the offline queue */
		queueTitle: () => string;
		/** New entries: keep what was typed on this device until it's saved */
		draftKey?: string | null;
		/** "▲ Restored …" when a draft comes back, read as it's restored */
		restoredLabel?: () => string;
		meta?: string | null;
		error?: string | null;
		/** edit mode: the entry's delete action and its confirmation (G6 "Delete entry") */
		remove?: { action: string; title: string; body: string } | null;
		ontankclick?: () => void;
		children: Snippet;
		/** above the footer's buttons, e.g. the test's out-of-range summary */
		footNote?: Snippet;
		/** desktop: beside the buttons, e.g. "3 of 8 filled" */
		footInfo?: Snippet;
	} = $props();

	const initialWhen = untrack(() => when);
	let picking = $state(false);
	let clientId = $state('');
	let busy = $state(false);
	onMount(() => (clientId = crypto.randomUUID()));

	// An entry that was left before it was saved comes back, with Discard.
	let restored = $state<{ label: string; discard: () => Promise<void> } | null>(null);
	function onrestore(r: Restored) {
		if (r.date && r.time) when = { date: r.date, time: r.time };
		restored = {
			label: restoredLabel(),
			discard: async () => {
				restored = null;
				when = initialWhen;
				await r.discard();
			}
		};
	}

	const types = $derived<{ t: 'test' | EventCategory; label: string; key?: string }[]>([
		{ t: 'test', label: 'Test', key: 'T' },
		...LOG_TYPES.map((l) => ({ t: l.category, label: l.label, key: l.key }))
	]);
</script>

<form
	method="POST"
	enctype="multipart/form-data"
	class="logform"
	class:test={current === 'test'}
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
			{#if mode === 'new' && typeHref}
				<!-- every type as one wrapping row of equal chips, this one accent (README § 11) -->
				<nav class="types" aria-label="Log type">
					{#each types as ty (ty.t)}
						<a class="ty" class:on={current === ty.t} aria-current={current === ty.t ? 'page' : undefined} href={typeHref(ty.t)}
							>{ty.label}{#if ty.key}<kbd aria-hidden="true">{ty.key}</kbd>{/if}</a
						>
					{/each}
				</nav>
			{/if}
			<div class="trow">
				<h1>{title}</h1>
				<button type="button" class="when" onclick={() => (picking = true)}
					><span class="when-k">When</span>{' '}<b>{whenLabel(when)}</b>{' '}<span class="when-c">▾</span></button
				>
			</div>
		</header>

		<div class="body">
			{#if meta}<p class="meta">{meta}</p>{/if}
			{#if error}<p class="banner banner-bad" role="alert">✕ {error}</p>{/if}
			{#if restored}
				<div class="draft-note" role="status">
					<span>▲ {restored.label}</span>
					<button type="button" class="btn-text" onclick={() => restored?.discard()}>Discard</button>
				</div>
			{/if}
			{@render children()}
		</div>

		<footer class="foot">
			{@render footNote?.()}
			<div class="foot-line">
				{#if remove}<button type="button" class="btn btn-danger remove" popovertarget="confirm-entry-delete">Delete entry</button>{/if}
				<span class="info">{@render footInfo?.()}</span>
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
	/* a field scrolled or tabbed to stays clear of the sticky Save bar */
	:global(html:has(.logform)) {
		scroll-padding-bottom: 112px;
	}
	/* the test's bar has its summary above Save */
	:global(html:has(.logform.test)) {
		scroll-padding-bottom: 132px;
	}
	.logform {
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
	.types {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
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

	/* ── Body: the notices, then the form's own fields ── */
	.body {
		display: flex;
		flex-direction: column;
		padding-bottom: 20px;
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

	/* ── Footer: a note, then Save, sticky on phones; Delete entry at the start ── */
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
	.foot-line {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.info,
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
		:global(html:has(.logform)) {
			scroll-padding-bottom: 96px;
		}
		.logform {
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
		.foot {
			margin: 0;
			padding: 12px 0 0;
		}
		.info {
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
	}
</style>
