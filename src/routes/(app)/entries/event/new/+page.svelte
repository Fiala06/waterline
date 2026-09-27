<script lang="ts">
	import { page } from '$app/state';
	import EventForm from '$lib/components/EventForm.svelte';
	import { ui } from '$lib/ui.svelte';
	import type { EventCategory } from '$lib/types';
	let { data, form } = $props();

	function categoryHref(c: EventCategory) {
		const q = new URLSearchParams(page.url.searchParams);
		q.set('category', c);
		q.delete('task');
		return `/entries/event/new?${q}`;
	}
</script>

<svelte:head><title>Log event · {data.tank.name}</title></svelte:head>

{#key `${data.tank.id}-${data.category}`}
	<EventForm
		category={data.category}
		{categoryHref}
		tankName={data.tank.name}
		volUnit={data.context.volUnit}
		tankVolume={data.context.tankVolume}
		tankVolumeIsActual={data.context.tankVolumeIsActual}
		values={form?.values ?? {}}
		initialNote={typeof form?.values?.note === 'string' ? form.values.note : ''}
		initialWhen={data.when}
		timeZone={data.user.timeZone}
		closeHref="/?tank={data.tank.id}"
		task={data.task}
		recentProducts={data.recentProducts}
		productLinks={data.productLinks}
		inventory={data.inventory}
		water={data.water}
		error={form?.error}
		errors={form?.errors}
		ontankclick={() => (ui.tankSwitcher = true)}
		draftKey="{data.user.id}:event:{data.tank.id}:{data.category}"
	/>
{/key}
