<script lang="ts">
	import EventForm from '$lib/components/EventForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Edit entry · Waterline</title></svelte:head>

<EventForm
	mode="edit"
	category={data.entry.category}
	tankName={data.entry.tankName}
	volUnit={data.context.volUnit}
	tankVolume={data.context.tankVolume}
	tankVolumeIsActual={data.context.tankVolumeIsActual}
	values={form?.values ?? data.values}
	initialNote={typeof form?.values?.note === 'string' ? form.values.note : data.entry.note}
	initialWhen={data.when}
	timeZone={data.user.timeZone}
	closeHref="/entries/event/{data.entry.id}"
	error={form?.error}
	errors={form?.errors}
	meta={data.meta}
	existingPhotos={data.photos}
/>
