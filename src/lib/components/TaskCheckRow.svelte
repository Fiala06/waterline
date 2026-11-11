<script lang="ts">
	// "Also mark the reminder “Water test” done", with where it stands on its own
	// line (#163): one row in every log form (#263).
	import type { ReminderTask } from '$lib/tasks';
	import { splitTask } from './entry-form';

	let {
		task,
		entryDate = null,
		name = 'completeTask',
		bare = false
	}: {
		task: { id: string; label: string; sub?: string; checked: boolean; schedule?: ReminderTask; today?: string };
		/** the entry's day, so "next" follows its When */
		entryDate?: string | null;
		name?: string;
		/** inside another block (the test's water change): no rules of its own */
		bare?: boolean;
	} = $props();

	const text = $derived(splitTask(task, entryDate));
</script>

{#if text}
	<label class="check-row task" class:bare>
		<input type="checkbox" {name} value={task.id} defaultChecked={task.checked} />
		<span class="task-text"><span>{text.main}</span>{#if text.next}{' '}<span class="next">{text.next}</span>{/if}</span>
	</label>
{/if}

<style>
	.task {
		padding: 10px 0;
		border-top: 1px solid var(--divider);
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
		line-height: 1.4;
	}
	.bare {
		padding: 0;
		border: none;
	}
	.next {
		display: block;
	}
</style>
