<script lang="ts">
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import EntryDetail from '$lib/components/EntryDetail.svelte';
	import { ui } from '$lib/ui.svelte';
	let { data } = $props();
	const e = $derived(data.entry);
</script>

<svelte:head><title>{e.title} · Waterline</title></svelte:head>

<EntryDetail
	title={e.title}
	when="{e.when} · {e.kindLabel}"
	edited={e.edited}
	rows={e.rows}
	note={e.note}
	photos={e.photos}
	backHref="/?tank={e.tankId}"
	editHref={e.editable ? `/entries/event/${e.id}/edit` : ''}
>
	{#snippet actions()}
		<ConfirmDelete
			fields={{ from: ui.prev ?? '' }}
			id="confirm-delete"
			title="Delete this entry?"
			body="“{e.title}” from {e.day} will be removed. This can't be undone."
		/>
	{/snippet}
</EntryDetail>
