<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { onMount } from 'svelte';
	let { data, form } = $props();
	// Signed out: forget pages the service worker cached for the last user.
	onMount(() => navigator.serviceWorker?.controller?.postMessage('clear-user-cache'));
	let showLocal = $state(false);
	const error = $derived(form?.error ?? data.error);
	$effect(() => {
		if (form?.error && data.local) showLocal = true;
	});
</script>

<svelte:head><title>Sign in · Waterline</title></svelte:head>

<div class="wrap">
	<div class="hero">
		<Logo size={88} />
		<h1>Waterline</h1>
		<p>Water tests, water changes and maintenance for every tank you keep.</p>
	</div>

	<div class="actions">
		{#if error}<p class="banner banner-bad" role="alert">✕ {error}</p>{/if}

		{#if data.google}
			<form method="POST" action="?/google">
				<input type="hidden" name="redirectTo" value={data.redirectTo} />
				<button class="google"><span class="g" aria-hidden="true">G</span>Sign in with Google</button>
			</form>
		{:else if !data.dev}
			<p class="banner banner-bad">Google sign-in isn't configured. Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.</p>
		{/if}

		{#if data.dev}
			<form method="POST" action="?/dev" class="local">
				<input type="hidden" name="redirectTo" value={data.redirectTo} />
				<p class="dev-note">Test sign-in (AUTH_DEV_LOGIN) stands in for Google.</p>
				<input class="input" name="email" type="email" placeholder="Email" required autocomplete="email" />
				<input class="input" name="name" placeholder="Name" autocomplete="name" />
				<button class="google"><span class="g" aria-hidden="true">G</span>Sign in with Google (test)</button>
			</form>
		{/if}

		{#if data.local}
			{#if showLocal}
				<form method="POST" action="?/local" class="local">
					<input type="hidden" name="redirectTo" value={data.redirectTo} />
					<label class="sr-only" for="username">Admin username</label>
					<input class="input" id="username" name="username" placeholder="Admin username" required autocomplete="username" />
					<label class="sr-only" for="password">Password</label>
					<input class="input" id="password" name="password" type="password" placeholder="Password" required autocomplete="current-password" />
					<button class="btn btn-lg">Local admin login</button>
				</form>
			{:else}
				<p class="muted owner">
					Server owner? <button type="button" class="link" onclick={() => (showLocal = true)}>Use local admin login</button>
				</p>
			{/if}
		{/if}
		<p class="host mono">self-hosted · {data.host}</p>
	</div>
</div>

<style>
	.wrap {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		max-width: 440px;
		margin: 0 auto;
		padding: env(safe-area-inset-top) 0 0;
	}
	.hero {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 20px;
		padding: 48px 32px 24px;
		text-align: center;
	}
	h1 {
		margin: 0;
		font-size: 38px;
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.hero p {
		margin: 0;
		font-size: 17px;
		line-height: 1.5;
		color: var(--text-muted);
		max-width: 280px;
	}
	.actions {
		padding: 0 24px calc(40px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 16px;
		align-items: stretch;
	}
	.google {
		width: 100%;
		height: 56px;
		border-radius: 14px;
		background: var(--google-bg);
		color: var(--google-text);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		font-size: 17px;
		font-weight: 600;
	}
	.g {
		width: 24px;
		height: 24px;
		border-radius: 12px;
		border: 2px solid currentColor;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 13px;
		font-weight: 700;
	}
	.local {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.dev-note {
		margin: 0;
		font-size: 13px;
		color: var(--warn);
	}
	.owner {
		text-align: center;
		margin: 0;
		font-size: 15px;
	}
	.link {
		color: var(--accent);
		font-weight: 600;
	}
	.host {
		text-align: center;
		margin: 0;
		font-size: 12px;
		color: var(--text-faint);
	}
	@media (min-width: 1024px) {
		h1 {
			font-size: 48px;
		}
	}
</style>
