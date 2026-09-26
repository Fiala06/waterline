<script lang="ts">
	import TestForm from '$lib/components/TestForm.svelte';
	let { data, form } = $props();
	const readings = $derived(Object.keys(data.values).length);
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
	existingPhotos={data.photos}
	previous={data.previous}
	remove={{
		action: `/entries/test/${data.entry.id}?/delete`,
		title: 'Delete this water test?',
		body: `The ${readings} reading${readings === 1 ? '' : 's'} from ${data.entry.day} will be removed. This can't be undone.`
	}}
/>
