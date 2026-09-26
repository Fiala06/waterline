<script lang="ts">
	import EquipmentForm from '$lib/components/EquipmentForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Add equipment · Waterline</title></svelte:head>

<EquipmentForm mode="new" values={data.values} errors={form?.errors} brands={data.brands} prefs={data.user} today={data.today} cancelHref="/tanks/{data.tankId}/equipment" />
