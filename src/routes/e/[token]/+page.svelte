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
	// "✓ Water change done" / "✓ Snoozed Water change": success always shows its icon
	const doneText = $derived(form?.done ? (form.message.startsWith('✓') ? form.message : `✓ ${form.message}`) : '');
</script>

<svelte:head><title>{data.task?.name ?? 'Waterline'} · Waterline</title></svelte:head>

<div class="wrap">
	<Logo size={40} wordmark wordSize={22} />
	<div class="card box">
		{#if form?.done}
			<h1 class="status-ok">{doneText}</h1>
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
		<a class="open" href="/">Open Waterline</a>
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
		gap: 28px;
	}
	.box {
		padding: 18px 0 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h1 {
		margin: 0;
		font-size: 26px;
		line-height: 1.2;
	}
	p {
		margin: 0;
	}
	.small {
		font-size: 14px;
	}
	.open {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-weight: 800;
	}
</style>
