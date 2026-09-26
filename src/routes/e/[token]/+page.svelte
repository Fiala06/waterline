<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	let { data, form } = $props();
	const state = $derived(form?.error ?? data.state);
	const messages: Record<string, string> = {
		used: 'This link was already used.',
		expired: 'This link has expired.',
		stale: 'This reminder is out of date: the task has been done or rescheduled since.',
		missing: "This link isn't valid."
	};
</script>

<svelte:head><title>{data.task?.name ?? 'Waterline'} · Waterline</title></svelte:head>

<div class="wrap">
	<Logo size={40} wordmark wordSize={22} />
	<div class="card box">
		{#if form?.done}
			<h1 class="status-ok">{form.message}</h1>
			{#if form.next}<p class="muted">Next due {form.next}.</p>{/if}
		{:else if state === 'ok' && data.task}
			<p class="muted small">{data.task.tankName}{data.task.due ? ` · due ${data.task.due}` : ''} · {data.task.repeats}</p>
			<h1>{data.action === 'done' ? `Mark “${data.task.name}” done?` : `Snooze “${data.task.name}” 1 day?`}</h1>
			<form method="POST">
				<button class="btn btn-primary btn-lg">{data.action === 'done' ? 'Mark done' : 'Snooze 1 day'}</button>
			</form>
			<p class="muted small">No sign-in needed. This link works once.</p>
		{:else}
			<h1>{messages[state] ?? messages.missing}</h1>
		{/if}
		<a href="/">Open Waterline</a>
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
	}
	.small {
		font-size: 14px;
	}
</style>
