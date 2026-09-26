<script lang="ts">
	import TankCreateForm from '$lib/components/TankCreateForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Add tank · Waterline</title></svelte:head>

<div class="wrap">
	<!-- on desktop the header has "Tanks › Add tank" -->
	<div class="top hide-desk">
		<a href="/tanks" class="back">‹ Tanks</a>
		<h1>Add tank</h1>
	</div>
	<TankCreateForm volUnit={data.volUnit} errors={form?.errors} values={form?.values} submitLabel="Create tank" cancelHref="/tanks" />
</div>

<style>
	.wrap {
		min-height: 100dvh;
		max-width: 520px;
		display: flex;
		flex-direction: column;
	}
	.top {
		padding: 12px 24px 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	@media (min-width: 1024px) {
		.wrap {
			min-height: 0;
			max-width: none;
			padding: 0 32px;
		}
	}
</style>
