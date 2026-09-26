<script lang="ts">
	import TankCreateForm from '$lib/components/TankCreateForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Create your first tank · Waterline</title></svelte:head>

<div class="screen">
	<div class="wrap">
		<div class="head">
			<div class="progress" aria-hidden="true"><i></i><i></i></div>
			<div class="step">Step 2 of 2</div>
			<h1>Create your first tank</h1>
		</div>
		<TankCreateForm volUnit={data.volUnit} errors={form?.errors} values={form?.values} />
		<a class="skip" href="/">Skip, I'll add a tank later</a>
	</div>
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

	/* Desktop: a centered card like step 1 (D2); the form keeps its own 24px insets */
	@media (min-width: 1024px) {
		.screen {
			min-height: 100dvh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 40px;
		}
		.wrap {
			min-height: 0;
			width: 560px;
			max-width: 100%;
			margin: 0;
			padding: 12px 12px 20px;
			border-radius: 20px;
			background: var(--surface);
			border: 1px solid var(--border);
		}
		.head {
			padding: 24px 24px 0;
			gap: 4px;
		}
		.progress {
			margin-bottom: 18px;
		}
		.step {
			margin-top: 0;
		}
		.skip {
			align-self: center;
			display: inline-flex;
			align-items: center;
			min-height: 44px;
			padding: 0 8px;
		}
	}
</style>
