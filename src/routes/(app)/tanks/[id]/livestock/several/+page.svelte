<script lang="ts">
	import AddSeveral from '$lib/components/AddSeveral.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Add several · {data.tank.name}</title></svelte:head>

<AddSeveral list="livestock" tank={data.tank} water={data.water} today={data.today} error={form?.error ?? ''} />
