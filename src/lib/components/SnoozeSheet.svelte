<script lang="ts">
	// Snooze (README → Screens §10): Later today, Tomorrow, In 2 days, This weekend,
	// Next week, each with its date, and Pick a date. A 260px menu under the
	// Snooze ▾ button on desktop, a bottom sheet on phones. Moves only this
	// occurrence; the schedule after it stays the same.
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import DateField from './DateField.svelte';
	import { snoozeOptions } from '$lib/tasks';
	import { addDays, fmtDate } from '$lib/time';

	let {
		open = $bindable(false),
		task,
		tankName,
		today,
		anchor = null
	}: {
		open?: boolean;
		task: { id: string; name: string; due: string } | null;
		tankName: string;
		today: string;
		/** where the Snooze ▾ button is: the desktop menu hangs under its right edge */
		anchor?: DOMRect | null;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	let picking = $state(false);
	let custom = $state('');
	// the server only takes dates after the due date (or after today when overdue)
	const minDate = $derived(task ? addDays(task.due > today ? task.due : today, 1) : '');
	$effect(() => {
		if (open) {
			picking = false;
			custom = minDate;
		}
	});
	const options = $derived(task ? snoozeOptions(today, task.due) : []);
	const from = $derived(page.url.pathname + page.url.search);
	const longDate = (d: string) =>
		new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
	// the menu's place on desktop: under the button, right-aligned, kept on screen
	const menuStyle = $derived.by(() => {
		if (!anchor) return '';
		const top = Math.min(anchor.bottom + 6, Math.max(16, innerHeight - 420));
		const right = Math.max(16, innerWidth - anchor.right);
		return `--top:${top}px;--right:${right}px`;
	});
	const close = () => (open = false);
	const submitting = () => async ({ update }: { update: () => Promise<void> }) => {
		open = false;
		await update();
	};
</script>

<dialog
	bind:this={dialog}
	class="snooze"
	class:anchored={!!anchor}
	style={menuStyle}
	aria-label="Snooze"
	onclose={close}
	onclick={(e) => {
		if (e.target === dialog) open = false;
	}}
>
	{#if task}
		<div class="panel">
			<div class="handle" aria-hidden="true"></div>
			<div class="head">
				<span class="kicker">{task.name} · {tankName}</span>
				<h2>Snooze until</h2>
			</div>
			<div class="opts">
				{#each options as o (o.label)}
					<form method="POST" action="/tasks?/snooze" use:enhance={submitting}>
						<input type="hidden" name="taskId" value={task.id} />
						<input type="hidden" name="until" value={o.date} />
						<input type="hidden" name="from" value={from} />
						<button class="opt"><span>{o.label}</span><span class="date">{longDate(o.date)}</span></button>
					</form>
				{/each}
				{#if picking}
					<form method="POST" action="/tasks?/snooze" class="pick" use:enhance={submitting}>
						<input type="hidden" name="taskId" value={task.id} />
						<input type="hidden" name="from" value={from} />
						<div class="pick-date-field">
							<DateField name="until" bind:value={custom} min={minDate} required label="Snooze until" format="weekday" {today} />
						</div>
						<button class="btn btn-primary">Snooze</button>
					</form>
				{:else}
					<button type="button" class="opt pick-date" onclick={() => (picking = true)}><span>Pick a date…</span><span aria-hidden="true">›</span></button>
				{/if}
			</div>
			<p class="note">Snoozing moves only this occurrence. The schedule after it stays the same.</p>
			<button type="button" class="btn cancel" onclick={close}>Cancel</button>
		</div>
	{/if}
</dialog>

<style>
	/* phones: a bottom sheet with a 2px ink top rule and a grabber over a 45% scrim */
	.snooze {
		padding: 0;
		border: none;
		background: transparent;
		color: var(--text);
		max-width: none;
		max-height: none;
		width: 100%;
		height: 100%;
		margin: 0;
		display: flex;
		align-items: flex-end;
	}
	.snooze:not([open]) {
		display: none;
	}
	.snooze::backdrop {
		background: var(--scrim);
		animation: wl-fade 0.2s ease-out;
	}
	.panel {
		width: 100%;
		max-height: 92dvh;
		overflow-y: auto;
		background: var(--bg);
		border-top: 2px solid var(--ink);
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 14px;
		animation: wl-slide-up 0.25s ease-out;
	}
	.handle {
		width: 44px;
		height: 4px;
		background: var(--neutral-400);
		align-self: center;
		flex-shrink: 0;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-bottom: 8px;
		border-bottom: 2px solid var(--ink);
	}
	h2 {
		margin: 0;
		font-size: 20px;
	}
	.opts {
		display: flex;
		flex-direction: column;
	}
	.opt {
		width: 100%;
		min-height: 52px;
		padding: 0 2px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		border-bottom: 1px solid var(--divider);
		font-size: 15px;
		font-weight: 700;
		text-align: left;
	}
	.date {
		font-size: 13px;
		font-weight: 400;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.pick-date span:last-child {
		color: var(--text-muted);
	}
	@media (hover: hover) {
		.opt:hover {
			background: var(--surface);
		}
	}
	.opt:focus-visible {
		outline-offset: -2px;
	}
	.pick {
		display: flex;
		gap: 8px;
		padding: 10px 0;
	}
	.pick-date-field {
		flex: 1;
		min-width: 0;
		display: flex;
	}
	.pick-date-field :global(.input) {
		flex: 1;
	}
	.note {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	/* desktop: a 260px menu with a 2px ink border under the Snooze button */
	@media (min-width: 1024px) {
		.snooze {
			align-items: center;
			justify-content: center;
		}
		.snooze::backdrop {
			background: transparent;
			animation: none;
		}
		.snooze.anchored {
			display: block;
			width: auto;
			height: auto;
			position: fixed;
			inset: auto;
			top: var(--top);
			right: var(--right);
		}
		.panel {
			width: 260px;
			max-height: calc(100vh - 32px);
			border: 2px solid var(--ink);
			box-shadow: var(--shadow-lg);
			padding: 10px 14px 12px;
			gap: 8px;
			animation: wl-fade 0.15s ease-out;
		}
		.handle,
		.cancel {
			display: none;
		}
		.head {
			border-bottom: none;
			padding-bottom: 0;
		}
		.head .kicker {
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		h2 {
			font-size: 15px;
		}
		.opt {
			min-height: 40px;
			font-size: 14px;
		}
		.pick {
			padding: 8px 0;
		}
		.pick-date-field :global(.input) {
			height: 36px;
			font-size: 13px;
		}
		.pick .btn {
			min-height: 36px;
			padding: 0 10px;
		}
		.note {
			font-size: 12px;
		}
	}
</style>
