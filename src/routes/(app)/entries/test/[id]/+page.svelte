<script lang="ts">
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import CopyReadings from '$lib/components/CopyReadings.svelte';
	import EntryDetail from '$lib/components/EntryDetail.svelte';
	import SuggestedStep from '$lib/components/SuggestedStep.svelte';
	import { ui } from '$lib/ui.svelte';
	let { data } = $props();
	const e = $derived(data.entry);
</script>

<svelte:head><title>{e.title} · Waterline</title></svelte:head>

<EntryDetail
	title={e.title}
	when={e.when}
	edited={e.edited}
	rows={e.rows}
	note={e.note}
	photos={e.photos}
	backHref="/?tank={e.tankId}"
	editHref="/entries/test/{e.id}/edit"
>
	{#snippet extra()}
		{#if data.suggestions.length}
			<!-- what the readings suggest (#179): a tap away, never on their own -->
			<div class="suggestions">
				{#each data.suggestions as s (s.rule)}<SuggestedStep {s} tankId={e.tankId} />{/each}
			</div>
		{/if}
	{/snippet}
	{#snippet actions()}
		{#if e.copy}<CopyReadings text={e.copy} />{/if}
		<ConfirmDelete
			fields={{ from: ui.prev ?? '' }}
			id="confirm-delete"
			title="Delete this water test?"
			body="The {e.rows.length} reading{e.rows.length === 1 ? '' : 's'} from {e.day} will be removed. This can't be undone."
		/>
	{/snippet}
</EntryDetail>

<style>
	.suggestions {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 16px;
	}
</style>
