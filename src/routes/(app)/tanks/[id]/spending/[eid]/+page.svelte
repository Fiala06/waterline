<script lang="ts">
	import ExpenseForm from '$lib/components/ExpenseForm.svelte';
	import { refusal } from '$lib/forms';
	let { data, form } = $props();
	const r = $derived(refusal(form, 'expense'));
</script>

<svelte:head><title>Edit expense · Waterline</title></svelte:head>

<ExpenseForm
	mode="edit"
	values={r.form ? (r.values as typeof data.values) : data.values}
	errors={r.errors}
	tanks={data.tanks}
	equipmentByTank={data.equipmentByTank}
	currencySymbol={data.currencySymbol}
	today={data.today}
	receipt={data.receipt}
	cancelHref="/tanks/{data.tankId}/spending"
/>
