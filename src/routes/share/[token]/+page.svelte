<script lang="ts">
	// A shared tank's Accept page (#22): the state of the invitation, and sign in (or Accept) to join.
	import Logo from '$lib/components/Logo.svelte';
	let { data } = $props();
	const can = $derived(data.role === 'log' ? 'log tests, water changes, dosing, notes and photos, and mark tasks done' : 'see how it’s doing');
</script>

<svelte:head><title>{data.tankName ? `${data.tankName} · shared with you` : 'Shared tank'} · Waterline</title></svelte:head>

<main class="wrap">
	<div class="card">
		<div class="brand"><Logo size={28} fish /><span>Waterline</span></div>
		{#if data.state === 'pending'}
			<span class="kicker">Shared with you</span>
			<h1>{data.inviter} shared {data.tankName}</h1>
			<p>You'll be able to {can}. The invitation is for <b>{data.email}</b>.</p>
			{#if data.canAccept}
				<form method="POST" action="?/accept"><button class="btn btn-primary wide">Accept · open {data.tankName}</button></form>
			{:else if data.signedInAs}
				<p class="banner banner-warn">▲ You're signed in as {data.signedInAs}. Sign out first, then open this link again as {data.email}.</p>
			{:else if data.google}
				<form method="POST" action="/signin?/google">
					<input type="hidden" name="redirectTo" value={data.here} />
					<button class="btn btn-primary wide">Sign in with Google to accept</button>
				</form>
			{:else if data.dev}
				<form method="POST" action="/signin?/dev">
					<input type="hidden" name="redirectTo" value={data.here} />
					<input type="hidden" name="email" value={data.email} />
					<p class="hint">▲ Test sign-in (AUTH_DEV_LOGIN) stands in for Google.</p>
					<button class="btn btn-primary wide">Sign in with Google (test) to accept</button>
				</form>
			{:else}
				<p class="banner banner-warn">▲ Google sign-in isn't set up on this server yet, so the invitation can't be accepted. Tell the admin.</p>
			{/if}
		{:else if data.state === 'accepted'}
			<h1>You're in</h1>
			<p>This invitation has been accepted. <a href="/signin">Sign in</a> as {data.email} to see {data.tankName}.</p>
		{:else if data.state === 'expired'}
			<h1>This invitation has expired</h1>
			<p>It was good for a week. Ask {data.inviter} to send a new one.</p>
		{:else if data.state === 'removed'}
			<h1>This invitation was withdrawn</h1>
			<p>Ask {data.inviter} if you should still have access to {data.tankName}.</p>
		{:else}
			<h1>That link isn't an invitation</h1>
			<p>Check the link in the email, or ask whoever shared the tank to send it again.</p>
		{/if}
	</div>
</main>

<style>
	.wrap {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px 16px;
	}
	.card {
		width: 100%;
		max-width: 440px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 28px 24px;
		border: 2px solid var(--ink);
		background: var(--bg);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 800;
		font-size: 18px;
	}
	h1 {
		margin: 0;
		font-size: 26px;
		font-weight: 800;
		line-height: 1.15;
	}
	p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--text-2);
	}
	p b {
		color: var(--text);
	}
	a {
		color: var(--accent-text);
		font-weight: 700;
	}
	.wide {
		width: 100%;
		min-height: 48px;
	}
	.hint {
		font-size: 13px;
		color: var(--text-muted);
		margin-bottom: 10px;
	}
</style>
