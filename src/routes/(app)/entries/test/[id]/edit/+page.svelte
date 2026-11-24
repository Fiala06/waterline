<script lang="ts">
	import TestForm from '$lib/components/TestForm.svelte';
	import { refusal } from '$lib/forms';
	import { refusedReadings } from '$lib/components/test-form';
	let { data, form } = $props();
	const r = $derived(refusal(form, 'test'));
	const readings = $derived(Object.keys(data.values).length);
</script>

<svelte:head><title>Edit water test · Waterline</title></svelte:head>

<TestForm
	mode="edit"
	tankName={data.entry.tankName}
	params={data.params}
	values={r.form ? refusedReadings(r.values) : data.values}
	initialNote={data.entry.note}
	initialWhen={data.when}
	timeZone={data.user.timeZone}
	closeHref="/entries/test/{data.entry.id}"
	error={r.message || null}
	fieldErrors={r.errors}
	meta={data.meta}
	existingPhotos={data.photos}
	previous={data.previous}
	remove={{
		action: `/entries/test/${data.entry.id}?/delete`,
		title: 'Delete this water test?',
		body: `The ${readings} reading${readings === 1 ? '' : 's'} from ${data.entry.day} will be removed. This can't be undone.`
	}}
/>
