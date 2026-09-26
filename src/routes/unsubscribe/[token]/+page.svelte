<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Unsubscribe · Waterline</title></svelte:head>

<div class="wrap">
	<Logo size={40} wordmark wordSize={22} />
	<div class="card box">
		{#if form?.done}
			<h1 class="status-ok">✓ You're unsubscribed</h1>
			<p class="muted">Waterline won't email {data.email} again. You can turn emails back on in Settings.</p>
		{:else if data.valid}
			<h1>Unsubscribe from all Waterline emails?</h1>
			<p class="muted">Reminders, overdue alerts, digests and out-of-range alerts to {data.email} will stop.</p>
			<form method="POST"><button class="btn btn-primary btn-lg">Unsubscribe</button></form>
		{:else}
			<h1>This link isn't valid.</h1>
		{/if}
		<a class="open" href="/settings#notifications">Notification settings</a>
	</div>
</div>

<style>
	.wrap {
		min-height: 100dvh;
		max-width: 460px;
		margin: 0 auto;
		padding: 48px 20px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.box {
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h1 {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		line-height: 1.3;
	}
	p {
		margin: 0;
		line-height: 1.5;
	}
	.open {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-weight: 600;
	}
</style>
