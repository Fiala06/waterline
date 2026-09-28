<script lang="ts">
	import TaskForm from '$lib/components/TaskForm.svelte';
	import { todayInZone } from '$lib/time';
	let { data, form } = $props();
</script>

<svelte:head><title>{data.values.type === 'task' ? 'Edit task' : 'Edit routine'} · Waterline</title></svelte:head>

<TaskForm mode="edit" tanks={data.formTanks} values={form?.values ?? data.values} errors={form?.errors} products={data.products} cancelHref="/tasks" today={todayInZone(data.user.timeZone)} />
