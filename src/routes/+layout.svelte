<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<title>Waterline</title>
</svelte:head>

{@render children()}
