<script lang="ts">
	import ExpenseForm from '$lib/components/ExpenseForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Edit expense · Waterline</title></svelte:head>

<ExpenseForm
	mode="edit"
	values={form?.values ?? data.values}
	errors={form?.errors}
	tanks={data.tanks}
	currencySymbol={data.currencySymbol}
	today={data.today}
	receipt={data.receipt}
	cancelHref="/tanks/{data.tankId}/spending"
/>
