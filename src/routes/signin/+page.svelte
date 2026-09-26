<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { onMount } from 'svelte';
	let { data, form } = $props();
	// Signed out: forget pages the service worker cached for the last user.
	onMount(() => navigator.serviceWorker?.controller?.postMessage('clear-user-cache'));
	const error = $derived(form?.error ?? data.error);
	// Phones open the admin form from a plain link (no JS needed); desktop always shows it (D1).
	const showLocal = $derived(data.showLocal || !!form?.error);
	const localHref = $derived(`?local${data.redirectTo !== '/' ? `&redirectTo=${encodeURIComponent(data.redirectTo)}` : ''}`);
</script>

<svelte:head><title>Sign in · Waterline</title></svelte:head>

<div class="wrap">
	<div class="hero">
		<Logo size={88} />
		<h1>Waterline</h1>
		<p>Water tests, water changes and maintenance for every tank you keep.</p>
	</div>

	<div class="actions">
		<h2 class="desk-only">Sign in</h2>
		{#if error}<p class="banner banner-bad" role="alert">✕ {error}</p>{/if}

		{#if data.google}
			<form method="POST" action="?/google">
				<input type="hidden" name="redirectTo" value={data.redirectTo} />
				<button class="google"><span class="g" aria-hidden="true">G</span>Sign in with Google</button>
			</form>
		{:else if !data.dev}
			<p class="banner banner-warn">▲ Google sign-in isn't set up. Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.</p>
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
			<div class="divider desk-only" aria-hidden="true"><span>server owner</span></div>
			<form method="POST" action="?/local" class="local admin" class:open={showLocal}>
				<input type="hidden" name="redirectTo" value={data.redirectTo} />
				<label class="sr-only" for="username">Admin username</label>
				<input class="input" id="username" name="username" placeholder="Admin username" required autocomplete="username" />
				<label class="sr-only" for="password">Password</label>
				<input class="input" id="password" name="password" type="password" placeholder="Password" required autocomplete="current-password" />
				<button class="btn btn-lg">Local admin login</button>
			</form>
			{#if !showLocal}
				<p class="muted owner">Server owner? <a class="link" href={localHref}>Use local admin login</a></p>
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
	.admin:not(.open),
	.desk-only {
		display: none;
	}
	.owner {
		text-align: center;
		margin: 0;
		font-size: 15px;
	}
	.link {
		color: var(--accent);
		font-weight: 600;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	.host {
		text-align: center;
		margin: 0;
		font-size: 12px;
		color: var(--text-faint);
	}
	@media (min-width: 1024px) {
		/* D1: brand on the left, a sign-in card on the right */
		.wrap {
			max-width: 1040px;
			flex-direction: row;
			align-items: center;
			gap: 64px;
			padding: 48px;
		}
		.hero {
			align-items: flex-start;
			text-align: left;
			padding: 0;
		}
		h1 {
			font-size: 48px;
		}
		.actions {
			width: 420px;
			flex-shrink: 0;
			padding: 32px;
			border-radius: 20px;
			background: var(--surface);
			border: 1px solid var(--border);
		}
		h2.desk-only {
			display: block;
			margin: 0;
			font-size: 22px;
			font-weight: 600;
		}
		.divider.desk-only {
			display: flex;
			align-items: center;
			gap: 12px;
			font-size: 13px;
			color: var(--text-faint);
		}
		.divider::before,
		.divider::after {
			content: '';
			flex: 1;
			height: 1px;
			background: var(--border);
		}
		.admin:not(.open) {
			display: flex;
		}
		.owner {
			display: none;
		}
	}
</style>
