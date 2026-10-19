<script lang="ts">
	// Alerts (#195): a page like Tasks, from the bell. Readings out of range
	// (each with its status, tank, target, when, a sparkline of its last
	// readings, Mark read and Log test or Open chart), overdue tasks (with
	// Snooze ▾ and Mark done, as on Tasks) and the admin's update notice, for
	// every tank or one, all or unread. Opening an alert marks it read on the
	// way; without JavaScript the links and forms still work.
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { hscroll } from '$lib/actions';
	import { alertSections, alertsKicker, isUnread, unreadCount, type Alert, type TaskAlert } from '$lib/alerts';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import SnoozeSheet from '$lib/components/SnoozeSheet.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';
	import { markDone } from '$lib/splash';

	let { data } = $props();
	const seen = $derived(data.alertsSeen);
	const sections = $derived(alertSections(data.alerts, seen, { tank: data.tank, unreadOnly: data.unreadOnly }));
	const kicker = $derived(alertsKicker(data.alerts.length, unreadCount(data.alerts, seen)));
	// Mark all read: the unread ones listed
	const unreadKeys = $derived([...sections.readings, ...sections.tasks, ...sections.updates].filter((a) => isUnread(a, seen)).map((a) => a.key));

	const from = $derived(page.url.pathname + page.url.search);
	const q = (patch: Record<string, string | null>) => {
		const u = new URLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(patch)) (v == null ? u.delete(k) : u.set(k, v));
		const s = u.toString();
		return `/alerts${s ? `?${s}` : ''}`;
	};

	// Opening an alert marks it read on the way; a plain link without JavaScript, or in a new tab.
	async function openAlert(e: MouseEvent, a: Alert) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || !isUnread(a, seen)) return;
		e.preventDefault();
		const body = new FormData();
		body.set('key', a.key);
		try {
			await fetch('/alerts?/read', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
		} catch {
			/* offline: it stays unread */
		}
		goto(a.href);
	}

	let snoozing = $state<TaskAlert['task'] | null>(null);
	let snoozeTank = $state('');
	let snoozeOpen = $state(false);
	// where the Snooze ▾ button is, so the desktop menu hangs under it
	let snoozeAnchor = $state<DOMRect | null>(null);
	function snooze(e: Event, a: TaskAlert) {
		e.preventDefault();
		snoozing = a.task;
		snoozeTank = a.tankName;
		snoozeAnchor = (e.currentTarget as HTMLElement).getBoundingClientRect();
		snoozeOpen = true;
	}
</script>

<svelte:head><title>Alerts · Waterline</title></svelte:head>

<div class="page">
	<div class="head hide-desk">
		<span class="kicker">{kicker}</span>
		<h1>Alerts</h1>
	</div>

	<div class="bar">
		{#if data.tanks.length > 1}
			<div class="seg-links hscroll tank-filter" role="group" aria-label="Filter by tank" use:hscroll={data.tank}>
				<a class="seg-link" class:selected={!data.tank} aria-current={!data.tank ? 'true' : undefined} href={q({ tank: null })}>All tanks</a>
				{#each data.tanks as t (t.id)}
					<a class="seg-link" class:selected={data.tank === t.id} aria-current={data.tank === t.id ? 'true' : undefined} href={q({ tank: t.id })}>{t.name}</a>
				{/each}
			</div>
		{/if}
		<div class="show">
			<div class="seg-links" role="group" aria-label="Show">
				<a class="seg-link" class:selected={!data.unreadOnly} aria-current={!data.unreadOnly ? 'true' : undefined} href={q({ show: null })}>All · {sections.total}</a>
				<a class="seg-link" class:selected={data.unreadOnly} aria-current={data.unreadOnly ? 'true' : undefined} href={q({ show: 'unread' })}>Unread · {sections.unread}</a>
			</div>
			<form method="POST" action="?/read" use:enhance>
				{#each unreadKeys as k (k)}<input type="hidden" name="key" value={k} />{/each}
				<button class="ghost" disabled={!unreadKeys.length}>Mark all read</button>
			</form>
		</div>
	</div>

	{#if !sections.shown}
		{#if !data.alerts.length}
			<div class="empty">
				<EmptyState
					icon="test"
					title="Nothing needs attention"
					text="Readings out of range and overdue tasks show up here. They also go out by email and push."
					href="/settings#notifications"
					label="Notification settings"
				/>
			</div>
		{:else}
			<p class="none">You're all caught up. <a href={q({ show: null, tank: null })}>Show every alert</a></p>
		{/if}
	{/if}

	{#if sections.readings.length}
		<section aria-labelledby="readings-h">
			<div class="sec-head">
				<h2 id="readings-h" class="sec status-bad">✕ Out of range · {sections.readings.length}</h2>
				<span class="note hide-phone">Newest first</span>
			</div>
			<div class="rows">
				{#each sections.readings as a (a.key)}
					{@const unread = isUnread(a, seen)}
					<div class="row reading" class:unread>
						<a class="rtext" href={a.href} onclick={(e) => openAlert(e, a)}>
							<span class="name">{a.title}</span>
							<span class="line">
								<span class="when status-bad">{a.status}</span>
								<span class="meta">{a.tankName}{a.range ? ` · Target ${a.range}` : ''}{a.sensor ? ` · ${a.sensor}` : ''} · {a.when}</span>
							</span>
						</a>
						<span class="spark" aria-hidden="true"><Sparkline values={a.spark ?? []} level="bad" lo={a.lo} hi={a.hi} /></span>
						<div class="acts">
							<form method="POST" action={unread ? '?/read' : '?/unread'} use:enhance>
								<input type="hidden" name="key" value={a.key} />
								<button class="ghost">{unread ? 'Mark read' : 'Mark unread'}</button>
							</form>
							{#if a.sensor}
								<a class="btn mark" class:btn-primary={unread} href={a.href} onclick={(e) => openAlert(e, a)}>Open chart</a>
							{:else}
								<a class="btn mark" class:btn-primary={unread} href={a.logHref}>Log test</a>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if sections.tasks.length}
		<section aria-labelledby="tasks-h">
			<div class="sec-head">
				<h2 id="tasks-h" class="sec status-bad">✕ Overdue · {sections.tasks.length}</h2>
				<a class="note strong" href="/tasks">All tasks ›</a>
			</div>
			<div class="rows">
				{#each sections.tasks as a (a.key)}
					{@const unread = isUnread(a, seen)}
					<div class="row" class:unread>
						<a class="rtext" href={a.href} onclick={(e) => openAlert(e, a)}>
							<span class="name">{a.title}</span>
							<span class="line">
								<span class="when status-bad">{a.dueText}</span>
								<span class="meta">{a.tankName} · {a.every}</span>
							</span>
						</a>
						<div class="acts">
							<form method="POST" action="/tasks?/snooze" use:enhance>
								<input type="hidden" name="taskId" value={a.taskId} />
								<input type="hidden" name="from" value={from} />
								<button class="ghost" aria-expanded={snoozeOpen && snoozing?.id === a.taskId} onclick={(e) => snooze(e, a)}>Snooze<span aria-hidden="true">&nbsp;▾</span></button>
							</form>
							<form method="POST" action="/tasks?/done" use:enhance={markDone}>
								<input type="hidden" name="taskId" value={a.taskId} />
								<input type="hidden" name="from" value={from} />
								<button class="btn btn-primary mark" aria-label={a.task.kind === 'review' ? a.title : `Mark ${a.title} done`}>{a.task.kind === 'review' ? 'Review' : 'Mark done'}</button>
							</form>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if sections.updates.length}
		<section aria-labelledby="updates-h">
			<div class="sec-head"><h2 id="updates-h" class="sec">↑ Waterline</h2></div>
			<div class="rows">
				{#each sections.updates as a (a.key)}
					{@const unread = isUnread(a, seen)}
					<div class="row" class:unread>
						<a class="rtext" href={a.href} onclick={(e) => openAlert(e, a)}>
							<span class="name">{a.title}</span>
							<span class="line"><span class="meta">{a.sub}</span></span>
						</a>
						<div class="acts">
							<form method="POST" action={unread ? '?/read' : '?/unread'} use:enhance>
								<input type="hidden" name="key" value={a.key} />
								<button class="ghost">{unread ? 'Mark read' : 'Mark unread'}</button>
							</form>
							<a class="btn mark" href={a.href} onclick={(e) => openAlert(e, a)}>What's new</a>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<p class="foot">Also sent by email and push. <a href="/settings#notifications">Notification settings ›</a></p>
</div>

<SnoozeSheet bind:open={snoozeOpen} task={snoozing} tankName={snoozeTank} today={data.today} anchor={snoozeAnchor} />

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	/* the phone head: kicker, Alerts 28/800 */
	.head {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 0 4px;
	}
	.kicker {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	h1 {
		margin: 0;
		font-size: 28px;
	}
	.bar {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.show {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	/* the filters: one bordered row, the chosen part accent */
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
	.ghost:disabled {
		color: var(--text-muted);
		font-weight: 600;
		cursor: default;
	}
	.ghost[aria-expanded='true'] {
		background: var(--surface);
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
	.note {
		font-size: 13px;
		color: var(--text-muted);
	}
	.note.strong {
		font-weight: 800;
		color: var(--accent-text);
	}
	.rows {
		display: flex;
		flex-direction: column;
	}
	/* a row: the title, then its status and tank · target · when; a 3px accent mark while it's unread */
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
		padding: 10px 0 10px 8px;
		border-bottom: 1px solid var(--divider);
		border-left: 3px solid transparent;
	}
	.row.unread {
		border-left-color: var(--accent);
	}
	.rtext {
		display: flex;
		flex-direction: column;
		gap: 3px;
		color: var(--text);
		min-width: 0;
	}
	.name {
		font-size: 15px;
		font-weight: 400;
	}
	.row.unread .name {
		font-weight: 700;
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
	.meta {
		font-size: 13px;
		color: var(--text-2);
		min-width: 0;
	}
	/* the sparkline sits between the text and the buttons on a computer */
	.spark {
		display: none;
	}
	.acts {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 6px;
	}
	.mark {
		display: inline-flex;
		align-items: center;
		min-height: 40px;
		padding: 0 14px;
	}
	.none {
		margin: 0;
		padding: 12px 0;
		color: var(--text-muted);
	}
	.none a {
		font-weight: 800;
	}
	.foot {
		margin: 0;
		padding-top: 12px;
		border-top: 1px solid var(--divider);
		font-size: 13px;
		color: var(--text-muted);
	}
	.foot a {
		font-weight: 800;
	}
	@media (min-width: 1024px) {
		.page {
			padding: 22px 32px 48px;
			gap: 22px;
		}
		.bar {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
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
		.row.reading {
			grid-template-columns: minmax(0, 1fr) 120px auto;
		}
		.spark {
			display: block;
			width: 120px;
			height: 28px;
		}
	}
</style>
