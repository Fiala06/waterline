<script lang="ts">
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import EntryDetail from '$lib/components/EntryDetail.svelte';
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
			id="confirm-delete"
			title="Delete this {e.kindLabel.toLowerCase()}?"
			body="“{e.title}” will be removed from the history. This can't be undone."
		/>
	{/snippet}
</EntryDetail>
