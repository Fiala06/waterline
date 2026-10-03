<script lang="ts">
	// G11 · "Add Waterline to your home screen", shown on phones from the 2nd visit.
	// Chrome/Android use the browser's install prompt; Safari gets the Share steps.
	import { onMount } from 'svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { install, promptInstall } from '$lib/install.svelte';

	const KEY_VISITS = 'wl_visits';
	const KEY_DISMISSED = 'wl_install_dismissed';
	const get = (k: string) => {
		try {
			return localStorage.getItem(k);
		} catch {
			return null;
		}
	};
	const set = (k: string, v: string) => {
		try {
			localStorage.setItem(k, v);
		} catch {
			/* private mode */
		}
	};

	let eligible = $state(false);
	onMount(() => {
		try {
			if (!sessionStorage.getItem('wl_counted')) {
				sessionStorage.setItem('wl_counted', '1');
				set(KEY_VISITS, String(Number(get(KEY_VISITS) ?? '0') + 1));
			}
		} catch {
			/* storage blocked */
		}
		const visits = Number(get(KEY_VISITS) ?? '0');
		const recentlyDismissed = Date.now() - Number(get(KEY_DISMISSED) ?? '0') < 30 * 86_400_000;
		eligible = visits >= 2 && !recentlyDismissed && matchMedia('(max-width: 1023px)').matches;
	});

	const show = $derived(eligible && !install.installed && (install.available || install.ios));
	// Safari has no install prompt: the card shows the steps and one button to close it.
	const steps = $derived(install.ios && !install.available);

	function notNow() {
		set(KEY_DISMISSED, String(Date.now()));
		eligible = false;
	}
	async function doInstall() {
		const outcome = await promptInstall();
		if (outcome === 'dismissed') notNow();
		eligible = false;
	}
</script>

{#if show}
	<div class="install" role="region" aria-label="Install Waterline">
		<div class="top">
			<span class="icon" aria-hidden="true"><Logo size={36} /></span>
			<div class="text">
				<strong>Add Waterline to your home screen</strong>
				{#if steps}
					<span>Tap <b>Share</b>, then <b>Add to Home Screen</b>.</span>
				{:else}
					<span>Opens full screen, works offline at the tank.</span>
				{/if}
			</div>
		</div>
		<div class="actions">
			{#if steps}
				<button type="button" class="btn" onclick={notNow}>Got it</button>
			{:else}
				<button type="button" class="btn" onclick={notNow}>Not now</button>
				<button type="button" class="btn btn-primary" onclick={doInstall}>Install</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.install {
		position: fixed;
		left: 16px;
		right: 16px;
		bottom: calc(100px + env(safe-area-inset-bottom));
		z-index: 30;
		max-width: 480px;
		margin-inline: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		border-radius: 0;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		box-shadow: var(--shadow-modal);
		animation: wl-slide-up 0.25s ease-out;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.icon {
		width: 56px;
		height: 56px;
		flex-shrink: 0;
		border-radius: 0;
		background: var(--bg);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 13px;
		line-height: 1.4;
		color: var(--text-muted);
	}
	.text strong {
		color: var(--text);
		font-size: 17px;
		font-weight: 600;
		line-height: 1.3;
		text-wrap: balance;
	}
	.text b {
		color: var(--text-2);
	}
	.actions {
		display: flex;
		gap: 8px;
	}
	.actions .btn {
		flex: 1;
		height: 46px;
		font-size: 15px;
	}
	.actions .btn:not(.btn-primary) {
		font-weight: 400;
	}
</style>
