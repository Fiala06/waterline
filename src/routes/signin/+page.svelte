<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { onMount } from 'svelte';
	import { clearAllDrafts } from '$lib/draft';
	let { data, form } = $props();
	// Signed out: forget pages the service worker cached for the last user, and unsaved log entries.
	onMount(() => {
		navigator.serviceWorker?.controller?.postMessage('clear-user-cache');
		clearAllDrafts();
	});
	const error = $derived(form?.error ?? data.error);
	// Phones open the admin form from a plain link (no JS needed); desktop always shows it.
	const showLocal = $derived(data.showLocal || !!form?.error);
	const localHref = $derived(`?local${data.redirectTo !== '/' ? `&redirectTo=${encodeURIComponent(data.redirectTo)}` : ''}`);
</script>

<!-- Google's own "G", in its colors, as its sign-in branding asks -->
{#snippet googleMark()}
	<svg class="g" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
		<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
		<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
		<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
		<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
	</svg>
{/snippet}

<svelte:head><title>Sign in · Waterline</title></svelte:head>

<div class="wrap">
	<div class="hero">
		<Logo size={72} fish />
		<div class="brand">
			<span class="kicker">Self-hosted aquarium log</span>
			<h1>Waterline</h1>
			<p>Water tests, water changes and maintenance for every tank you keep.</p>
		</div>
	</div>

	<div class="side">
		<div class="actions">
			<h2 class="hide-phone">Sign in</h2>
			{#if error}<p class="banner banner-bad" role="alert">✕ {error}</p>{/if}

			{#if data.google}
				<form method="POST" action="?/google">
					<input type="hidden" name="redirectTo" value={data.redirectTo} />
					<button class="google">{@render googleMark()}Sign in with Google</button>
				</form>
			{:else if !data.dev}
				<p class="banner banner-warn">▲ Google sign-in isn't set up yet. The admin can turn it on in Settings › Server settings.</p>
			{/if}

			{#if data.dev}
				<form method="POST" action="?/dev" class="local">
					<input type="hidden" name="redirectTo" value={data.redirectTo} />
					<p class="dev-note">▲ Test sign-in (AUTH_DEV_LOGIN) stands in for Google.</p>
					<input class="input" name="email" type="email" placeholder="Email" required autocomplete="email" />
					<input class="input" name="name" placeholder="Name" autocomplete="name" />
					<button class="google">{@render googleMark()}Sign in with Google (test)</button>
				</form>
			{/if}

			{#if data.local}
				<div class="divider hide-phone" aria-hidden="true"><span>Server owner</span></div>
				<form method="POST" action="?/local" class="local admin" class:open={showLocal}>
					<input type="hidden" name="redirectTo" value={data.redirectTo} />
					<label class="sr-only" for="username">Admin username</label>
					<input class="input" id="username" name="username" placeholder="Admin username" required autocomplete="username" />
					<label class="sr-only" for="password">Password</label>
					<input class="input" id="password" name="password" type="password" placeholder="Password" required autocomplete="current-password" />
					<button class="btn btn-lg">Local admin login</button>
				</form>
				{#if !showLocal}
					<p class="owner">Server owner? <a class="link" href={localHref}>Use local admin login</a></p>
				{/if}
			{/if}
			<p class="host kicker">self-hosted · {data.host}</p>
		</div>
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
	.brand {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	h1 {
		margin: 0;
		font-size: 42px;
		letter-spacing: -0.02em;
		line-height: 1;
	}
	.hero p {
		margin: 0;
		font-size: 16px;
		line-height: 1.5;
		max-width: 300px;
	}
	.actions {
		padding: 0 20px calc(40px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 16px;
		align-items: stretch;
	}
	/* Google's button: ink on the page, as the one dark fill */
	.google {
		width: 100%;
		height: 52px;
		background: var(--google-bg);
		color: var(--google-text);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		font-size: 16px;
		font-weight: 800;
	}
	.g {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
	}
	.local {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.dev-note {
		margin: 0;
		font-size: 13px;
		font-weight: 700;
		color: var(--warn);
	}
	.admin:not(.open) {
		display: none;
	}
	.owner {
		text-align: center;
		margin: 0;
		font-size: 15px;
	}
	.link {
		font-weight: 800;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	.host {
		text-align: center;
		margin: 0;
	}
	.banner {
		margin: 0;
	}

	/* desktop: the brand on the left half, the sign-in column on the right, a 2px rule between */
	@media (min-width: 1024px) {
		.wrap {
			max-width: none;
			display: grid;
			grid-template-columns: 1fr 1fr;
			padding: 0;
		}
		.hero {
			align-items: flex-start;
			justify-content: flex-end;
			gap: 28px;
			padding: 64px 96px;
			text-align: left;
			border-right: 2px solid var(--divider);
		}
		.hero :global(svg) {
			width: 96px;
			height: 96px;
		}
		h1 {
			font-size: 72px;
		}
		.hero p {
			font-size: 20px;
			max-width: 420px;
		}
		.side {
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 48px;
		}
		.actions {
			width: 380px;
			padding: 0;
			gap: 18px;
		}
		h2 {
			margin: 0;
			padding-bottom: 10px;
			border-bottom: 2px solid var(--ink);
			font-size: 28px;
		}
		.divider {
			display: flex;
			align-items: center;
			gap: 12px;
			font-size: 11px;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--text-muted);
		}
		.divider::before,
		.divider::after {
			content: '';
			flex: 1;
			height: 1px;
			background: var(--divider);
		}
		.local {
			gap: 12px;
		}
		.local .btn-lg {
			height: 44px;
			font-size: 14px;
		}
		.admin:not(.open) {
			display: flex;
		}
		.owner {
			display: none;
		}
		.host {
			text-align: left;
		}
	}
</style>
