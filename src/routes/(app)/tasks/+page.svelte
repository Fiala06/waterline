<script lang="ts">
	import TaskList from '$lib/components/TaskList.svelte';
	import { dueInfo } from '$lib/tasks';

	let { data } = $props();

	const tankNames = $derived(Object.fromEntries(data.tanks.map((t) => [t.id, t.name])));
	const sections = $derived.by(() => {
		const by = { overdue: [] as typeof data.tasks, soon: [] as typeof data.tasks, later: [] as typeof data.tasks };
		for (const t of data.tasks) if (t.nextDue) by[dueInfo(t.nextDue, data.today).section].push(t);
		return [
			{ key: 'overdue', label: `✕ Overdue · ${by.overdue.length}`, cls: 'status-bad', tasks: by.overdue },
			{ key: 'soon', label: `▲ Due soon · ${by.soon.length}`, cls: 'status-warn', tasks: by.soon },
			{ key: 'later', label: `Later · ${by.later.length}`, cls: 'muted', tasks: by.later }
		].filter((s) => s.tasks.length);
	});
</script>

<svelte:head><title>Tasks · Waterline</title></svelte:head>

<div class="page">
	<h1>Tasks</h1>
	{#if data.tanks.length > 1}
		<div class="chips" role="group" aria-label="Filter by tank">
			<a class="chip" class:selected={!data.filter} href="/tasks">All tanks</a>
			{#each data.tanks as t (t.id)}
				<a class="chip" class:selected={data.filter === t.id} href="/tasks?filter={t.id}">{t.name}</a>
			{/each}
		</div>
	{/if}

	{#if !sections.length}
		<div class="card empty">
			<strong>Nothing due</strong>
			<span class="muted">Set up reminders for water changes and upkeep.</span>
		</div>
	{/if}

	{#each sections as s (s.key)}
		<section>
			<h2 class="caps {s.cls}">{s.label}</h2>
			<TaskList tasks={s.tasks} today={data.today} tankNames={tankNames} />
		</section>
	{/each}
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		max-width: 760px;
	}
	h1 {
		margin: 8px 0 0;
		font-size: 28px;
		font-weight: 600;
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
	.chip.selected:hover {
		color: var(--on-accent);
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.caps {
		margin: 0;
		font-size: 13px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		font-weight: 600;
	}
	.empty {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
		}
	}
</style>
