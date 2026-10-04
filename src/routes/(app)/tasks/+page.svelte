<script lang="ts">
	// Tasks (README → Screens §10): Overdue / Due soon / Later across all tanks,
	// each row with its name, the when (✕/▲), tank · cadence, Done and Snooze ▾
	// (on tasks due within a day). On desktop the selected task edits in a pane.
	import { enhance } from '$app/forms';
	import { markDone } from '$lib/splash';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { hscroll } from '$lib/actions';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import SnoozeSheet from '$lib/components/SnoozeSheet.svelte';
	import TaskForm from '$lib/components/TaskForm.svelte';
	import { dueInfo, intervalText, isRoutine, routineLine } from '$lib/tasks';
	import { REVIEW_ABOUT } from '$lib/review';

	let { data } = $props();
	// a routine's line has its amount too: "1 pump · Mon, Wed, Fri"
	const every = (t: (typeof data.tasks)[number]) => (isRoutine(t.kind) ? routineLine(t) : intervalText(t));
	// The pane posts to /tasks/[id] or /tasks/new; TaskForm puts their errors in page.form.
	const paneForm = $derived(
		page.form as { values?: NonNullable<typeof data.pane>['values']; errors?: Record<string, string> } | null
	);

	const tankNames = $derived(Object.fromEntries(data.tanks.map((t) => [t.id, t.name])));
	type T = (typeof data.tasks)[number];
	const sections = $derived.by(() => {
		const by = { overdue: [] as T[], soon: [] as T[], later: [] as T[] };
		for (const t of data.tasks) by[dueInfo(t.due, data.today).section].push(t);
		return by;
	});
	// 06: phones list the first few later tasks, then "Show all" (a link, so it works without JS).
	const LATER_LIMIT = 3;
	const showAllLater = $derived(page.url.searchParams.get('later') === 'all');
	// The task in the desktop pane (D5); phones never show a selection.
	const selectedId = $derived(data.pane?.mode === 'edit' ? data.pane.taskId : null);

	const from = $derived(page.url.pathname + page.url.search);
	const q = (patch: Record<string, string | null>) => {
		const u = new URLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(patch)) (v == null ? u.delete(k) : u.set(k, v));
		const s = u.toString();
		return `/tasks${s ? `?${s}` : ''}`;
	};

	// Desktop edits in the right pane; phones open the task page.
	const isDesktop = () => matchMedia('(min-width: 1024px)').matches;
	function openEdit(e: MouseEvent, id: string | null) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || !isDesktop()) return;
		e.preventDefault();
		goto(q(id ? { edit: id, new: null } : { new: '', edit: null }), { noScroll: true, keepFocus: true });
	}

	let snoozing = $state<T | null>(null);
	let snoozeOpen = $state(false);
	// where the Snooze ▾ button is, so the desktop menu hangs under it
	let snoozeAnchor = $state<DOMRect | null>(null);
	function snooze(e: Event, t: T) {
		e.preventDefault();
		snoozing = t;
		snoozeAnchor = (e.currentTarget as HTMLElement).getBoundingClientRect();
		snoozeOpen = true;
	}

	const longDue = (d: string) =>
		new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
	// "✕ Overdue 1 day", "▲ Due today", "▲ Sat, Sep 27", "Fri, Oct 3"
	const dueLabel = (t: T) => {
		const d = dueInfo(t.due, data.today);
		if (d.section === 'overdue' || d.days === 0) return d.text;
		return d.level === 'warn' ? `▲ ${longDue(t.due)}` : longDue(t.due);
	};
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	const SECTIONS = $derived([
		{ key: 'overdue', label: `✕ Overdue · ${sections.overdue.length}`, cls: 'status-bad', items: sections.overdue },
		{ key: 'soon', label: `▲ Due soon · ${sections.soon.length}`, cls: 'status-warn', items: sections.soon },
		{ key: 'later', label: `Later · ${sections.later.length}`, cls: 'muted', items: sections.later }
	]);
</script>

<svelte:head><title>Tasks · Waterline</title></svelte:head>

<div class="page" class:with-pane={!!data.pane}>
	<div class="list-col">
		<div class="head hide-desk">
			<div class="head-text">
				<span class="kicker">{data.overdueCount ? `${data.overdueCount} overdue` : 'Every tank'}</span>
				<h1>Tasks</h1>
			</div>
			<a class="btn btn-primary new" href={data.filter ? `/tasks/new?tank=${data.filter}` : '/tasks/new'}>New task</a>
		</div>
		{#if data.tanks.length > 1}
			<div class="seg-links hscroll tank-filter" role="group" aria-label="Filter by tank" use:hscroll={data.filter}>
				<a class="seg-link" class:selected={!data.filter} aria-current={!data.filter ? 'true' : undefined} href={q({ filter: null, edit: null })}>All tanks</a>
				{#each data.tanks as t (t.id)}
					<a
						class="seg-link"
						class:selected={data.filter === t.id}
						aria-current={data.filter === t.id ? 'true' : undefined}
						href={q({ filter: t.id, edit: null })}>{t.name}</a
					>
				{/each}
			</div>
		{/if}

		{#if !data.tasks.length}
			<div class="empty">
				<EmptyState icon="maintenance" title="Nothing due" text="The fish approve. Set up reminders for water changes and upkeep.">
					<a class="btn" href={data.filter ? `/tasks/new?tank=${data.filter}` : '/tasks/new'} onclick={(e) => openEdit(e, null)}>New task</a>
				</EmptyState>
			</div>
		{/if}

		{#each SECTIONS as s (s.key)}
			{#if s.items.length}
				{@const folded = s.key === 'later' && s.items.length > LATER_LIMIT && !showAllLater}
				<section>
					<div class="sec-head">
						<h2 class="sec {s.cls}">{s.label}</h2>
						{#if folded}<a class="show-all hide-desk" href={q({ later: 'all' })} data-sveltekit-noscroll>Show all</a>{/if}
					</div>
					<div class="rows">
						{#each s.items as t, i (t.id)}
							{@const d = dueInfo(t.due, data.today)}
							<div class="row {s.key}" class:selected={selectedId === t.id} class:extra={folded && i >= LATER_LIMIT}>
								<a class="rtext t-link" href="/tasks/{t.id}" onclick={(e) => openEdit(e, t.id)}>
									<span class="name">{t.name}</span>
									{#if t.kind === 'review'}<span class="about">{REVIEW_ABOUT}</span>{/if}
									<span class="line">
										<span class="when {d.level === 'ok' ? 'plain' : `status-${d.level}`}">{dueLabel(t)}</span>
										<span class="meta">{tankNames[t.tankId]} · {every(t)}</span>
									</span>
								</a>
								<div class="acts">
									<!-- Snooze on every task: one not due yet moves back from its due date -->
									<form method="POST" action="/tasks?/snooze" use:enhance>
										<input type="hidden" name="taskId" value={t.id} />
										<input type="hidden" name="from" value={from} />
										<button class="ghost snooze" aria-expanded={snoozeOpen && snoozing?.id === t.id} onclick={(e) => snooze(e, t)}
											>Snooze<span aria-hidden="true">&nbsp;▾</span></button
										>
									</form>
									<form method="POST" action="/tasks?/done" use:enhance={markDone}>
										<input type="hidden" name="taskId" value={t.id} />
										<input type="hidden" name="from" value={from} />
										{#if s.key === 'overdue'}
											<button class="btn btn-primary mark">{t.kind === 'review' ? 'Review' : 'Mark done'}</button>
										{:else}
											<button class="btn mark" class:btn-primary={d.days <= 0} aria-label={t.kind === 'review' ? t.name : `Mark ${t.name} done`}
												>{t.kind === 'review' ? 'Review' : 'Mark done'}</button
											>
										{/if}
									</form>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		{/each}
		<a class="cal-link" href="/settings#calendar">See your tasks in your calendar ›</a>
	</div>

	{#if data.pane}
		<aside class="pane" aria-label={data.pane.mode === 'edit' ? 'Edit task' : 'New task'}>
			<div class="pane-inner">
				{#key data.pane.taskId ?? 'new'}
					<TaskForm
						compact
						mode={data.pane.mode}
						tanks={data.formTanks}
						values={paneForm?.values ?? data.pane.values}
						errors={paneForm?.errors}
						products={data.products}
						action={data.pane.taskId ? `/tasks/${data.pane.taskId}` : '/tasks/new'}
						cancelHref={q({ edit: null, new: null })}
						afterSave={q(data.pane.taskId ? { edit: data.pane.taskId, new: null } : { edit: null, new: null })}
						today={data.today}
					/>
				{/key}
			</div>
		</aside>
	{/if}
</div>

<SnoozeSheet bind:open={snoozeOpen} task={snoozing} tankName={snoozing ? tankNames[snoozing.tankId] : ''} today={data.today} anchor={snoozeAnchor} />

<style>
	.page {
		padding: 8px 20px 24px;
	}
	.list-col {
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-width: 0;
	}
	/* the phone head: kicker, Tasks 28/800, + New task */
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 12px;
		padding: 8px 0 4px;
	}
	.head-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
	}
	/* the tank filter: one bordered row, the chosen part accent */
	.seg-links {
		display: flex;
		gap: 0;
		align-self: flex-start;
		max-width: 100%;
		border: 1px solid var(--divider);
	}
	.seg-link {
		display: flex;
		align-items: center;
		min-height: 42px;
		padding: 0 14px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
	}
	.seg-link + .seg-link {
		border-left: 1px solid var(--divider);
	}
	.seg-link.selected {
		background: var(--accent);
		color: var(--on-accent);
		font-weight: 800;
	}
	.tank-filter {
		margin-inline: -20px;
		padding-inline: 20px;
		border: none;
	}
	.tank-filter .seg-link {
		border: 1px solid var(--divider);
	}
	.tank-filter .seg-link + .seg-link {
		border-left: none;
	}
	.tank-filter .seg-link.selected {
		border-color: var(--accent);
	}
	section {
		display: flex;
		flex-direction: column;
	}
	.sec-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
	}
	.sec {
		margin: 0;
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.sec.muted {
		color: var(--text-muted);
	}
	.show-all {
		display: inline-flex;
		align-items: center;
		font-size: 14px;
		font-weight: 800;
		/* 44px to tap without making the header taller */
		min-height: 44px;
		margin-block: -13px;
	}
	.rows {
		display: flex;
		flex-direction: column;
	}
	/* a row: name, then the when and tank · cadence; a 3px mark at the left for what's due */
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
		padding: 10px 0 10px 8px;
		border-bottom: 1px solid var(--divider);
		border-left: 3px solid transparent;
	}
	.row.overdue {
		border-left-color: var(--accent);
	}
	.row.soon {
		border-left-color: var(--neutral-400);
	}
	.row.selected {
		background: var(--surface);
	}
	.t-link {
		display: flex;
		flex-direction: column;
		gap: 3px;
		color: var(--text);
		min-width: 0;
	}
	.name {
		font-size: 15px;
		font-weight: 600;
	}
	.about {
		font-size: 13px;
		color: var(--text-muted);
	}
	.line {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 12px;
	}
	.when {
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.when.plain {
		color: var(--text-muted);
	}
	.meta {
		font-size: 13px;
		color: var(--text-2);
		white-space: nowrap;
	}
	.acts {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 6px;
	}
	.ghost {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 8px;
		font-size: 14px;
		font-weight: 800;
		color: var(--text-2);
		white-space: nowrap;
	}
	.ghost[aria-expanded='true'] {
		background: var(--surface);
	}
	.mark {
		min-height: 40px;
		padding: 0 14px;
	}
	.cal-link {
		align-self: flex-start;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		font-size: 14px;
		font-weight: 800;
	}
	.pane {
		display: none;
	}
	@media (max-width: 1023px) {
		.row.extra {
			display: none;
		}
		/* phones: Snooze stays on what's overdue (the sheet has the same choices); rows keep to one action */
		.row:not(.overdue) .snooze {
			display: none;
		}
		.row {
			padding-left: 10px;
		}
		.mark {
			padding: 0 12px;
		}
	}
	@media (hover: hover) {
		.ghost:hover {
			background: var(--surface);
			color: var(--text);
		}
		.row:not(.selected):has(> .t-link:hover) {
			background: var(--surface);
		}
		.t-link:hover .name {
			color: var(--accent-text);
		}
	}

	/* ── Desktop: the list, then a 380px edit pane past a 2px rule ───────── */
	@media (min-width: 1024px) {
		.page {
			padding: 0;
			display: grid;
			grid-template-columns: minmax(0, 1fr);
		}
		.page.with-pane {
			grid-template-columns: minmax(0, 1fr) clamp(340px, 31.25vw, 400px);
		}
		.list-col {
			padding: 22px 32px 48px;
			gap: 22px;
			container: tasks / inline-size;
		}
		.tank-filter {
			margin: 0;
			padding-inline: 0;
			flex-wrap: wrap;
			overflow: visible;
		}
		.empty {
			max-width: 560px;
		}
		.row {
			gap: 16px;
		}
		.mark {
			min-width: 110px;
		}
		.pane {
			display: block;
			min-width: 0;
			background: var(--surface);
			border-left: 2px solid var(--divider);
		}
		.pane-inner {
			position: sticky;
			top: 0;
			height: 100dvh;
			overflow-y: auto;
			padding: 28px 24px;
			display: flex;
			flex-direction: column;
		}
	}
</style>
