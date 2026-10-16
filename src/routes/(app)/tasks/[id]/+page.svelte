<script lang="ts">
	import TaskDoneLog from '$lib/components/TaskDoneLog.svelte';
	import TaskForm from '$lib/components/TaskForm.svelte';
	import { todayInZone } from '$lib/time';
	let { data, form } = $props();
</script>

<svelte:head><title>{data.values.type === 'task' ? 'Edit task' : 'Edit routine'} · Waterline</title></svelte:head>

<TaskForm mode="edit" tanks={data.formTanks} values={form?.values ?? data.values} errors={form?.errors} products={data.products} cancelHref="/tasks" today={todayInZone(data.user.timeZone)} />

<div class="done-log"><TaskDoneLog done={data.done} course={data.course} taskId={data.taskId} /></div>

<style>
	.done-log {
		max-width: 560px;
		margin-inline: auto;
		padding: 0 20px 24px;
	}
	/* under the form, as wide as it (TaskForm: 640px with 32px sides) */
	@media (min-width: 1024px) {
		.done-log {
			max-width: 640px;
			margin: 0;
			padding: 0 32px 48px;
		}
	}
</style>
