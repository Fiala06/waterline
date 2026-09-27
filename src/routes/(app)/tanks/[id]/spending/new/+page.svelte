<script lang="ts">
	import ExpenseForm from '$lib/components/ExpenseForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Add expense · {data.tank.name}</title></svelte:head>

<ExpenseForm
	mode="new"
	values={form?.values ?? data.values}
	errors={form?.errors}
	tanks={data.tanks}
	currencySymbol={data.currencySymbol}
	today={data.today}
	cancelHref="/tanks/{data.tank.id}/spending"
/>
