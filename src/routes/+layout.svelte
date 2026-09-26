<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	let { children } = $props();
	// Lets end-to-end tests wait until the page is interactive.
	onMount(() => (document.documentElement.dataset.ready = 'true'));
</script>

<svelte:head>
	<title>Waterline</title>
</svelte:head>

{@render children()}
