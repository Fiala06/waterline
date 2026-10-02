<script lang="ts">
	import { enhance } from '$app/forms';
	import { markDone } from '$lib/splash';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { hscroll } from '$lib/actions';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import SnoozeSheet from '$lib/components/SnoozeSheet.svelte';
	import TaskForm from '$lib/components/TaskForm.svelte';
	import { dueInfo, intervalText, isRoutine, routineLine } from '$lib/tasks';

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
	function snooze(e: Event, t: T) {
		e.preventDefault();
		snoozing = t;
		snoozeOpen = true;
	}

	const longDue = (d: string) =>
		new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
	// D5: "✕ Overdue 1 day", "▲ Due today", "▲ Sat, Sep 27", "Fri, Oct 3"
	const dueLabel = (t: T) => {
		const d = dueInfo(t.due, data.today);
		if (d.section === 'overdue' || d.days === 0) return d.text;
		return d.level === 'warn' ? `▲ ${longDue(t.due)}` : longDue(t.due);
	};
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	const fmtShort = (d: string) =>
		new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
</script>

<svelte:head><title>Tasks · Waterline</title></svelte:head>

<div class="page" class:with-pane={!!data.pane}>
	<div class="list-col">
		<div class="head hide-desk">
			<h1>Tasks</h1>
			<a class="btn new" href={data.filter ? `/tasks/new?tank=${data.filter}` : '/tasks/new'}>New task</a>
		</div>
		{#if data.tanks.length > 1}
			<div class="chips hscroll tank-filter" role="group" aria-label="Filter by tank" use:hscroll={data.filter}>
				<a class="chip" class:selected={!data.filter} aria-current={!data.filter ? 'true' : undefined} href={q({ filter: null, edit: null })}>All tanks</a>
				{#each data.tanks as t (t.id)}
					<a
						class="chip"
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

		{#if sections.overdue.length}
			<section>
				<h2 class="caps status-bad">✕ Overdue · {sections.overdue.length}</h2>
				{#each sections.overdue as t (t.id)}
					<div class="card ocard" class:selected={selectedId === t.id}>
						<a class="otext t-link" href="/tasks/{t.id}" onclick={(e) => openEdit(e, t.id)}>
							<span class="name">{t.name}</span>
							<span class="meta hide-desk">{tankNames[t.tankId]} · due {fmtShort(t.due)} · {every(t)}</span>
							<span class="d-due status-bad hide-phone">{dueInfo(t.due, data.today).text}</span>
							<span class="d-tank hide-phone">{tankNames[t.tankId]}</span>
							<span class="d-int hide-phone">{cap(every(t))}</span>
						</a>
						<div class="oactions">
							<form method="POST" action="/tasks?/done" use:enhance={markDone} class="grow">
								<input type="hidden" name="taskId" value={t.id} />
								<input type="hidden" name="from" value={from} />
								<button class="btn btn-primary mark">{t.kind === 'review' ? 'Review' : 'Mark done'}</button>
							</form>
							<form method="POST" action="/tasks?/snooze" use:enhance>
								<input type="hidden" name="taskId" value={t.id} />
								<input type="hidden" name="from" value={from} />
								<button class="btn snooze" onclick={(e) => snooze(e, t)}>Snooze</button>
							</form>
							<a class="btn more hide-desk" href="/tasks/{t.id}" aria-label="Edit {t.name}">•••</a>
						</div>
					</div>
				{/each}
			</section>
		{/if}

		{#each [{ key: 'soon', label: `▲ Due soon · ${sections.soon.length}`, cls: 'status-warn', items: sections.soon }, { key: 'later', label: `Later · ${sections.later.length}`, cls: 'muted', items: sections.later }] as s (s.key)}
			{#if s.items.length}
				{@const folded = s.key === 'later' && s.items.length > LATER_LIMIT && !showAllLater}
				<section>
					<div class="sec-head">
						<h2 class="caps {s.cls}">{s.label}</h2>
						{#if folded}<a class="show-all hide-desk" href={q({ later: 'all' })} data-sveltekit-noscroll>Show all</a>{/if}
					</div>
					<div class="card rows">
						{#each s.items as t, i (t.id)}
							{@const d = dueInfo(t.due, data.today)}
							<div class="row" class:selected={selectedId === t.id} class:extra={folded && i >= LATER_LIMIT}>
								<a class="rtext t-link" href="/tasks/{t.id}" onclick={(e) => openEdit(e, t.id)}>
									<span class="name">{t.name}</span>
									<!-- 06: only "Today" stands out; the section header carries the ▲ -->
									<span class="meta hide-desk"
										>{tankNames[t.tankId]}{' · '}{#if d.days === 0}<span class="today">Today</span>{:else}{fmtShort(t.due)}{/if}{' · '}{every(t)}</span
									>
									<span class="d-due hide-phone {d.level === 'ok' ? 'plain' : `status-${d.level}`}">{dueLabel(t)}</span>
									<span class="d-tank hide-phone">{tankNames[t.tankId]}</span>
									<span class="d-int hide-phone">{cap(every(t))}</span>
								</a>
								<form method="POST" action="/tasks?/done" use:enhance={markDone}>
									<input type="hidden" name="taskId" value={t.id} />
									<input type="hidden" name="from" value={from} />
									<button class="check" class:primary={d.days <= 0} aria-label={t.kind === 'review' ? t.name : `Mark ${t.name} done`}
										><span class="d-label">{t.kind === 'review' ? 'Review' : 'Mark done'}</span></button
									>
								</form>
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

<SnoozeSheet bind:open={snoozeOpen} task={snoozing} tankName={snoozing ? tankNames[snoozing.tankId] : ''} today={data.today} />

<style>
	.cal-link {
		align-self: flex-start;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		font-size: 14px;
		font-weight: 600;
	}
	.page {
		padding: 8px 20px 24px;
	}
	.list-col {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	/* 06: the chips run to the screen edge */
	.tank-filter {
		margin-inline: -20px;
		padding-inline: 20px;
	}
	.chip {
		color: var(--text);
	}
	.chip.selected,
	.chip.selected:hover {
		color: var(--on-accent);
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.sec-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.caps {
		margin: 0;
		font-size: 13px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		font-weight: 600;
	}
	.show-all {
		display: inline-flex;
		align-items: center;
		font-size: 14px;
		font-weight: 600;
		/* 44px to tap without making the header taller */
		min-height: 44px;
		margin-block: -13px;
	}
	.name {
		font-size: 16px;
		font-weight: 600;
	}
	.meta {
		font-size: 13px;
		color: var(--text-muted);
	}
	.today {
		color: var(--warn);
		font-weight: 600;
	}
	.t-link {
		display: flex;
		flex-direction: column;
		gap: 3px;
		color: var(--text);
		min-width: 0;
		flex: 1;
	}
	.ocard {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		border-color: var(--bad-border);
	}
	.oactions {
		display: flex;
		gap: 8px;
	}
	.grow {
		flex: 1;
	}
	.mark {
		width: 100%;
	}
	.snooze {
		font-weight: 400;
	}
	.more {
		width: 44px;
		padding: 0;
		color: var(--text-muted);
	}
	.rows {
		display: flex;
		flex-direction: column;
	}
	.row {
		position: relative;
		padding: 12px 14px;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.row + .row {
		border-top: 1px solid var(--border);
	}
	.row:first-child {
		border-top-left-radius: 15px;
		border-top-right-radius: 15px;
	}
	.row:last-child {
		border-bottom-left-radius: 15px;
		border-bottom-right-radius: 15px;
	}
	.check {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		border-radius: 22px;
		border: 2px solid var(--border-strong);
	}
	.d-label {
		display: none;
	}
	.pane {
		display: none;
	}
	@media (max-width: 1023px) {
		.row.extra {
			display: none;
		}
	}
	@media (hover: hover) and (max-width: 1023px) {
		.check:hover {
			border-color: var(--accent);
			background: var(--selected);
		}
	}

	/* ── D5: list + docked edit pane ─────────────────────────────── */
	@media (min-width: 1024px) {
		.page {
			padding: 0;
			display: grid;
			grid-template-columns: minmax(0, 1fr);
			min-height: calc(100dvh - 72px);
		}
		.page.with-pane {
			grid-template-columns: minmax(0, 1fr) clamp(340px, 31.25vw, 400px);
		}
		.list-col {
			padding: 18px 28px 32px;
			gap: 12px;
			container: tasks / inline-size;
		}
		.tank-filter {
			margin: 0 0 4px;
			padding-inline: 0;
			flex-wrap: wrap;
			overflow: visible;
		}
		.empty {
			max-width: 560px;
		}
		.ocard,
		.row {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
			column-gap: 16px;
			padding: 10px 16px;
			min-height: 64px;
		}
		.ocard {
			border-radius: 14px;
		}
		.rows {
			border-radius: 14px;
		}
		.row:first-child {
			border-top-left-radius: 13px;
			border-top-right-radius: 13px;
		}
		.row:last-child {
			border-bottom-left-radius: 13px;
			border-bottom-right-radius: 13px;
		}
		/* narrow list: name, due date, then tank · interval */
		.t-link {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: baseline;
			column-gap: 0;
			row-gap: 3px;
		}
		.t-link .name,
		.d-due {
			flex-basis: 100%;
		}
		.d-due {
			font-size: 13px;
			font-weight: 600;
		}
		.d-due.plain {
			color: var(--text-muted);
			font-weight: 400;
		}
		.d-tank,
		.d-int {
			font-size: 13px;
			color: var(--text-muted);
		}
		.d-int::before {
			content: '·';
			margin: 0 6px;
		}
		.oactions {
			flex: none;
		}
		.grow {
			flex: none;
		}
		.oactions .btn {
			min-height: 38px;
			height: 38px;
			padding: 0 14px;
			border-radius: 10px;
			font-size: 14px;
		}
		.oactions .snooze {
			padding: 0 12px;
		}
		.check {
			width: auto;
			height: 38px;
			padding: 0 14px;
			border-radius: 10px;
			border-width: 1px;
			font-size: 14px;
			font-weight: 600;
			white-space: nowrap;
		}
		.check.primary {
			background: var(--accent);
			border-color: var(--accent);
			color: var(--on-accent);
			font-weight: 700;
		}
		.d-label {
			display: inline;
		}
		/* D5: the task in the pane: accent border, tinted row */
		.ocard.selected {
			background: var(--selected);
			border-color: var(--accent);
		}
		.row.selected {
			z-index: 1;
			background: var(--selected);
		}
		.row.selected::after {
			content: '';
			position: absolute;
			inset: -1px;
			border: 1px solid var(--accent);
			border-radius: inherit;
			pointer-events: none;
		}
		.row.selected:first-child::after {
			border-top-left-radius: 14px;
			border-top-right-radius: 14px;
		}
		.row.selected:last-child::after {
			border-bottom-left-radius: 14px;
			border-bottom-right-radius: 14px;
		}
		.pane {
			display: block;
			min-width: 0;
			background: var(--surface-2);
			border-left: 1px solid var(--border);
		}
		.pane-inner {
			position: sticky;
			top: 0;
			height: calc(100dvh - 72px);
			overflow-y: auto;
			padding: 22px 24px;
			display: flex;
			flex-direction: column;
		}
		/* once the header has scrolled away the pane can use the full window height,
		   so Save stays at the bottom edge */
		@supports (animation-timeline: scroll()) {
			.pane-inner {
				animation: pane-fill linear both;
				animation-timeline: scroll(root);
				animation-range: 0px 72px;
			}
		}
	}
	@keyframes pane-fill {
		to {
			height: 100dvh;
		}
	}
	@media (min-width: 1024px) and (hover: hover) {
		.row:not(.selected):has(> .t-link:hover),
		.ocard:not(.selected):has(> .t-link:hover) {
			background: var(--surface-hi);
		}
		.check:not(.primary):hover {
			background: var(--surface-hi);
		}
		.check.primary:hover {
			background: color-mix(in srgb, var(--accent) 86%, var(--text));
			border-color: color-mix(in srgb, var(--accent) 86%, var(--text));
		}
	}
	/* D5 columns once the list is wide enough: name and due | tank | interval */
	@container tasks (min-width: 540px) {
		.t-link {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 128px;
			grid-template-areas: 'name tank' 'due int';
			column-gap: 16px;
		}
		.t-link .name {
			grid-area: name;
		}
		.d-due {
			grid-area: due;
		}
		.d-tank {
			grid-area: tank;
			font-size: 14px;
			color: var(--text-2);
		}
		.d-int {
			grid-area: int;
		}
		.d-int::before {
			content: none;
		}
	}
	@container tasks (min-width: 820px) {
		.t-link {
			grid-template-columns: minmax(0, 1fr) 140px 150px;
			grid-template-areas: 'name tank int' 'due tank int';
			align-items: center;
		}
		.d-int {
			font-size: 14px;
			color: var(--text-2);
		}
	}
</style>
