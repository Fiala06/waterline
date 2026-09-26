<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import SnoozeSheet from '$lib/components/SnoozeSheet.svelte';
	import TaskForm from '$lib/components/TaskForm.svelte';
	import { dueInfo, intervalText } from '$lib/tasks';

	let { data } = $props();
	// The pane posts to /tasks/[id] or /tasks/new; enhance puts any errors in page.form.
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
	let showAllLater = $state(false);
	const LATER_LIMIT = 5;

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
		if (e.metaKey || e.ctrlKey || !isDesktop()) return;
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
		<div class="head">
			<h1>Tasks</h1>
			<a class="btn new" href={data.filter ? `/tasks/new?tank=${data.filter}` : '/tasks/new'} onclick={(e) => openEdit(e, null)}>New task</a>
		</div>
		{#if data.tanks.length > 1}
			<div class="chips" role="group" aria-label="Filter by tank">
				<a class="chip" class:selected={!data.filter} href={q({ filter: null })}>All tanks</a>
				{#each data.tanks as t (t.id)}
					<a class="chip" class:selected={data.filter === t.id} href={q({ filter: t.id })}>{t.name}</a>
				{/each}
			</div>
		{/if}

		{#if !data.tasks.length}
			<div class="card empty">
				<strong>Nothing due</strong>
				<span class="muted">Set up reminders for water changes and upkeep.</span>
				<a class="btn btn-primary" href="/tasks/new" onclick={(e) => openEdit(e, null)}>New task</a>
			</div>
		{/if}

		{#if sections.overdue.length}
			<section>
				<h2 class="caps status-bad">✕ Overdue · {sections.overdue.length}</h2>
				{#each sections.overdue as t (t.id)}
					<div class="card ocard" class:editing={data.pane?.taskId === t.id}>
						<a class="otext" href="/tasks/{t.id}" onclick={(e) => openEdit(e, t.id)}>
							<span class="name">{t.name}</span>
							<span class="due status-bad">{dueInfo(t.due, data.today).text}</span>
							<span class="meta">{tankNames[t.tankId]} · due {fmtShort(t.due)} · {intervalText(t)}</span>
							<span class="dmeta">{tankNames[t.tankId]} · {cap(intervalText(t))}</span>
						</a>
						<div class="oactions">
							<form method="POST" action="/tasks?/done" use:enhance class="grow">
								<input type="hidden" name="taskId" value={t.id} />
								<input type="hidden" name="from" value={from} />
								<button class="btn btn-primary wide">Mark done</button>
							</form>
							<form method="POST" action="/tasks?/snooze" use:enhance>
								<input type="hidden" name="taskId" value={t.id} />
								<input type="hidden" name="from" value={from} />
								<button class="btn light" onclick={(e) => snooze(e, t)}>Snooze</button>
							</form>
							<a class="btn more" href="/tasks/{t.id}" aria-label="Edit {t.name}" onclick={(e) => openEdit(e, t.id)}>•••</a>
						</div>
					</div>
				{/each}
			</section>
		{/if}

		{#each [{ key: 'soon', label: `▲ Due soon · ${sections.soon.length}`, cls: 'status-warn', items: sections.soon }, { key: 'later', label: `Later · ${sections.later.length}`, cls: 'muted', items: sections.later }] as s (s.key)}
			{#if s.items.length}
				{@const shown = s.key === 'later' && !showAllLater ? s.items.slice(0, LATER_LIMIT) : s.items}
				<section>
					<div class="sec-head">
						<h2 class="caps {s.cls}">{s.label}</h2>
						{#if s.key === 'later' && s.items.length > LATER_LIMIT && !showAllLater}
							<button type="button" class="btn-text" onclick={() => (showAllLater = true)}>Show all</button>
						{/if}
					</div>
					<div class="card rows">
						{#each shown as t (t.id)}
							{@const d = dueInfo(t.due, data.today)}
							<div class="row" class:editing={data.pane?.taskId === t.id}>
								<a class="rtext" href="/tasks/{t.id}" onclick={(e) => openEdit(e, t.id)}>
									<span class="name">{t.name}</span>
									<span class="meta">
										{tankNames[t.tankId]} ·
										<span class:status-warn={d.level === 'warn'} class:strong={d.level === 'warn'}>{d.days === 0 ? 'Today' : fmtShort(t.due)}</span>
										· {intervalText(t)}
									</span>
									<span class="d-due status-{d.level}" class:plain={d.level === 'ok'}>{dueLabel(t)}</span>
									<span class="dmeta">{tankNames[t.tankId]} · {cap(intervalText(t))}</span>
								</a>
								<form method="POST" action="/tasks?/done" use:enhance>
									<input type="hidden" name="taskId" value={t.id} />
									<input type="hidden" name="from" value={from} />
									<button class="check" aria-label="Mark {t.name} done"><span class="d-label">Mark done</span></button>
								</form>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		{/each}
	</div>

	{#if data.pane}
		<aside class="card pane" aria-label={data.pane.mode === 'edit' ? 'Edit task' : 'New task'}>
			{#key data.pane.taskId ?? 'new'}
				<TaskForm
					compact
					mode={data.pane.mode}
					tanks={data.formTanks}
					values={paneForm?.values ?? data.pane.values}
					errors={paneForm?.errors}
					action={data.pane.taskId ? `/tasks/${data.pane.taskId}` : '/tasks/new'}
					cancelHref={q({ edit: null, new: null })}
				/>
			{/key}
		</aside>
	{/if}
</div>

<SnoozeSheet bind:open={snoozeOpen} task={snoozing} tankName={snoozing ? tankNames[snoozing.tankId] : ''} today={data.today} />

<style>
	.page {
		padding: 8px 20px 24px;
		max-width: 760px;
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
		margin-top: 8px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	.new {
		min-height: 40px;
	}
	.chips {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		scrollbar-width: none;
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
	}
	.caps {
		margin: 0;
		font-size: 13px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		font-weight: 600;
	}
	.name {
		font-size: 16px;
		font-weight: 600;
	}
	.meta {
		font-size: 13px;
		color: var(--text-muted);
	}
	.strong {
		font-weight: 600;
	}
	.ocard {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		border-color: var(--bad-border);
	}
	.otext,
	.rtext {
		display: flex;
		flex-direction: column;
		gap: 3px;
		color: var(--text);
		min-width: 0;
		flex: 1;
	}
	.otext .due {
		display: none;
		font-size: 13px;
		font-weight: 600;
	}
	.oactions {
		display: flex;
		gap: 8px;
	}
	.grow {
		flex: 1;
	}
	.wide {
		width: 100%;
	}
	.light {
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
		padding: 12px 14px;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.row + .row {
		border-top: 1px solid var(--border);
	}
	.d-due,
	.dmeta {
		display: none;
	}
	.check {
		width: 44px;
		height: 44px;
		border-radius: 22px;
		border: 2px solid var(--border-strong);
	}
	.check:hover {
		border-color: var(--accent);
		background: var(--selected);
	}
	.d-label {
		display: none;
	}
	.empty {
		padding: 16px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	.pane {
		display: none;
	}

	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
			max-width: none;
			display: grid;
			grid-template-columns: minmax(0, 1fr);
			gap: 28px;
			align-items: start;
		}
		.page.with-pane {
			grid-template-columns: minmax(0, 1fr) 400px;
		}
		.list-col {
			max-width: 820px;
		}
		.head {
			margin-top: 0;
		}
		.ocard,
		.row {
			flex-direction: row;
			align-items: center;
			padding: 14px 16px;
		}
		.ocard .meta,
		.rtext .meta {
			display: none;
		}
		.otext .due,
		.d-due {
			display: block;
			font-size: 13px;
			font-weight: 600;
		}
		.d-due.plain {
			color: var(--text-muted);
			font-weight: 400;
		}
		.dmeta {
			display: block;
			font-size: 13px;
			color: var(--text-muted);
		}
		.oactions {
			flex: none;
		}
		.grow {
			flex: none;
		}
		.more {
			display: none;
		}
		.check {
			width: auto;
			height: 38px;
			border-radius: 10px;
			border-width: 1px;
			padding: 0 14px;
			font-size: 14px;
			font-weight: 600;
		}
		.d-label {
			display: inline;
		}
		.ocard.editing,
		.row.editing {
			background: var(--selected);
		}
		.pane {
			display: block;
			position: sticky;
			top: 24px;
			overflow: hidden;
		}
	}
</style>
