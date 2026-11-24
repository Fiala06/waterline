<script lang="ts">
	import ExpenseForm from '$lib/components/ExpenseForm.svelte';
	import { refusal } from '$lib/forms';
	let { data, form } = $props();
	const r = $derived(refusal(form, 'expense'));
</script>

<svelte:head><title>Add expense · {data.tank.name}</title></svelte:head>

<ExpenseForm
	mode="new"
	values={r.form ? (r.values as typeof data.values) : data.values}
	errors={r.errors}
	tanks={data.tanks}
	equipmentByTank={data.equipmentByTank}
	currencySymbol={data.currencySymbol}
	today={data.today}
	cancelHref="/tanks/{data.tank.id}/spending"
/>
