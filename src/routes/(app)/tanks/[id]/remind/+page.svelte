<script lang="ts">
	// Remind me, on its own page: where the button leads without scripts.
	import RemindForm from '$lib/components/RemindForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Remind me · {data.tank.name}</title></svelte:head>

<div class="page">
	<!-- phones; on desktop the header has the title -->
	<div class="bar hide-desk">
		<a class="cancel" href={data.from}>Cancel</a>
		<h1>Remind me</h1>
		<span aria-hidden="true"></span>
	</div>
	<div class="body">
		<RemindForm
			tankId={data.tank.id}
			tankName={data.tank.name}
			today={data.today}
			from={data.from}
			error={form?.error ?? null}
			values={form?.values ?? null}
		/>
	</div>
</div>

<style>
	.page {
		max-width: 560px;
	}
	.bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 8px 20px;
	}
	.cancel {
		font-size: 15px;
		color: var(--text-muted);
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-self: start;
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
	}
	.body {
		padding: 8px 20px 24px;
	}
	@media (min-width: 1024px) {
		.page {
			max-width: 880px;
			padding: 24px 32px 48px;
		}
		.body {
			padding: 0;
			max-width: 560px;
		}
	}
</style>
