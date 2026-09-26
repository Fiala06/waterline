<script lang="ts">
	import TestForm from '$lib/components/TestForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Edit water test · Waterline</title></svelte:head>

<TestForm
	mode="edit"
	tankName={data.entry.tankName}
	params={data.params}
	values={form?.values ?? data.values}
	initialNote={data.entry.note}
	initialWhen={data.when}
	timeZone={data.user.timeZone}
	closeHref="/entries/test/{data.entry.id}"
	error={form?.error}
	fieldErrors={form?.errors}
	meta={data.meta}
/>
