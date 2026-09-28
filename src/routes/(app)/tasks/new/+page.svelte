<script lang="ts">
	import TaskForm from '$lib/components/TaskForm.svelte';
	import { todayInZone } from '$lib/time';
	let { data, form } = $props();
</script>

<svelte:head><title>{data.values.type === 'dosing' ? 'New dosing routine' : data.values.type === 'feeding' ? 'New feeding routine' : 'New task'} · Waterline</title></svelte:head>

<TaskForm
	mode="new"
	tanks={data.formTanks}
	values={form?.values ?? data.values}
	errors={form?.errors}
	products={data.products}
	from={data.from}
	cancelHref={data.from ?? '/tasks'}
	today={todayInZone(data.user.timeZone)}
/>
