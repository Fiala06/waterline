<script lang="ts">
	import EventForm from '$lib/components/EventForm.svelte';
	import { refusal } from '$lib/forms';
	import type { FormValues } from '$lib/components/event-form';
	let { data, form } = $props();
	const r = $derived(refusal(form, 'entry'));
</script>

<svelte:head><title>Edit entry · Waterline</title></svelte:head>

<EventForm
	mode="edit"
	category={data.entry.category}
	tankName={data.entry.tankName}
	volUnit={data.context.volUnit}
	tankVolume={data.context.tankVolume}
	tankVolumeIsActual={data.context.tankVolumeIsActual}
	values={r.form ? (r.values as FormValues) : data.values}
	initialNote={typeof r.values.note === 'string' ? r.values.note : data.entry.note}
	initialWhen={data.when}
	timeZone={data.user.timeZone}
	closeHref="/entries/event/{data.entry.id}"
	error={r.message || null}
	errors={r.errors}
	meta={data.meta}
	existingPhotos={data.photos}
	remove={{
		action: `/entries/event/${data.entry.id}?/delete`,
		title: 'Delete this entry?',
		body: `“${data.entry.title}” from ${data.entry.day} will be removed. This can't be undone.`
	}}
/>
