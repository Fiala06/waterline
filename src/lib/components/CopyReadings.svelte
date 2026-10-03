<script lang="ts">
	// Copy a water test as plain text ("pH 7.8", "Ammonia 0 ppm"), without the
	// statuses, to paste into a message. The text is made on the server
	// (EntryView.copy); the button needs scripts, so it appears once they've run.
	import { onMount } from 'svelte';
	import { toast } from '$lib/ui.svelte';

	let { text }: { text: string } = $props();
	let ready = $state(false);
	onMount(() => (ready = true));

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// no clipboard API (an http address): the old way, through a hidden text box
			const area = Object.assign(document.createElement('textarea'), { value: text });
			area.style.position = 'fixed';
			area.style.opacity = '0';
			document.body.append(area);
			area.select();
			document.execCommand('copy');
			area.remove();
		}
		toast('✓ Readings copied');
	}
</script>

{#if ready}<button type="button" class="btn copy" onclick={copy} aria-label="Copy readings as text">Copy</button>{/if}
