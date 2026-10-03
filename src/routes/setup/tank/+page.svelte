<script lang="ts">
	// First run, step 2: the first tank (redesign README § 17).
	import TankCreateForm from '$lib/components/TankCreateForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Create your first tank · Waterline</title></svelte:head>

<div class="screen">
	<div class="wrap">
		<div class="head">
			<span class="kicker">Step 2 of 2</span>
			<h1>Create your first tank</h1>
		</div>
		<TankCreateForm volUnit={data.volUnit} errors={form?.errors} values={form?.values} />
		<a class="skip" href="/">Skip, I'll add a tank later</a>
	</div>
</div>

<style>
	.screen {
		min-height: 100dvh;
		padding: env(safe-area-inset-top) 0 calc(24px + env(safe-area-inset-bottom));
	}
	.wrap {
		max-width: 560px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
	}
	.head {
		margin: 0 24px;
		padding: 24px 0 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		border-bottom: 2px solid var(--ink);
	}
	h1 {
		margin: 0;
		font-size: 32px;
		letter-spacing: -0.02em;
	}
	.skip {
		align-self: center;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 8px;
		font-size: 15px;
		font-weight: 700;
		color: var(--text-muted);
	}
	@media (min-width: 1024px) {
		.wrap {
			padding-top: 48px;
		}
		h1 {
			font-size: 42px;
		}
	}
</style>
