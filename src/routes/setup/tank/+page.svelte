<script lang="ts">
	import TankCreateForm from '$lib/components/TankCreateForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Create your first tank · Waterline</title></svelte:head>

<div class="wrap">
	<div class="head">
		<div class="progress" aria-hidden="true"><i></i><i></i></div>
		<div class="step">Step 2 of 2</div>
		<h1>Create your first tank</h1>
	</div>
	<TankCreateForm volUnit={data.volUnit} errors={form?.errors} values={form?.values} />
	<a class="skip" href="/">Skip, I'll add a tank later</a>
</div>

<style>
	.wrap {
		min-height: 100dvh;
		max-width: 480px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		padding-top: env(safe-area-inset-top);
	}
	.head {
		padding: 16px 24px 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.progress {
		display: flex;
		gap: 6px;
	}
	.progress i {
		height: 4px;
		flex: 1;
		border-radius: 2px;
		background: var(--accent);
	}
	.step {
		font-size: 13px;
		color: var(--text-muted);
		margin-top: 10px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	.skip {
		text-align: center;
		font-size: 15px;
		color: var(--text-muted);
		padding: 0 0 calc(24px + env(safe-area-inset-bottom));
		margin-top: -12px;
	}
</style>
