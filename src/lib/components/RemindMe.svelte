<script lang="ts">
	// The "Remind me" button: opens the reminder form in a sheet; without
	// scripts it's a link to the same form on its own page.
	import { page } from '$app/state';
	import RemindForm from './RemindForm.svelte';
	import Sheet from './Sheet.svelte';

	let { tankId, tankName, today, label = 'Remind me', cls = 'btn' }: { tankId: string; tankName: string; today: string; label?: string; cls?: string } =
		$props();
	let open = $state(false);
	const from = $derived(`${page.url.pathname}${page.url.search}`);
</script>

<a
	class={cls}
	href="/tanks/{tankId}/remind?from={encodeURIComponent(from)}"
	aria-haspopup="dialog"
	onclick={(e) => {
		e.preventDefault();
		open = true;
	}}>{label}</a
>
<Sheet bind:open title="Remind me about {tankName}" width={480}>
	{#if open}<RemindForm {tankId} {tankName} {today} {from} onsaved={() => (open = false)} />{/if}
</Sheet>
