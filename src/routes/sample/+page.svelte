<script lang="ts">
	// The sample tank (#301): the public tank page, with made-up data and its own label.
	import TankPage from '../t/[slug]/+page.svelte';
	let { data } = $props();
</script>

<TankPage {data} />
