<script lang="ts">
	// G11 · "Add Waterline to your home screen", shown on phones from the 2nd visit.
	// Chrome/Android use the browser's install prompt; Safari gets the Share steps.
	import { onMount } from 'svelte';
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
	<div class="install card" role="dialog" aria-label="Install Waterline">
		<img src="/icons/icon-192.png" alt="" width="48" height="48" />
		<div class="text">
			<strong>Add Waterline to your home screen</strong>
			{#if install.ios && !install.available}
				<span>Tap <b>Share</b>, then <b>Add to Home Screen</b>.</span>
			{:else}
				<span>Opens full screen, works offline at the tank.</span>
			{/if}
		</div>
		<div class="actions">
			<button type="button" class="btn" onclick={notNow}>Not now</button>
			{#if install.available}<button type="button" class="btn btn-primary" onclick={doInstall}>Install</button>{/if}
		</div>
	</div>
{/if}

<style>
	.install {
		position: fixed;
		left: 12px;
		right: 12px;
		bottom: calc(100px + env(safe-area-inset-bottom));
		z-index: 30;
		padding: 14px;
		display: grid;
		grid-template-columns: 48px 1fr;
		gap: 12px;
		align-items: center;
		box-shadow: var(--shadow-modal);
		border-color: var(--border-strong);
		animation: wl-slide-up 0.25s ease-out;
	}
	img {
		border-radius: 12px;
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 14px;
		color: var(--text-muted);
	}
	.text strong {
		color: var(--text);
		font-size: 15px;
	}
	.actions {
		grid-column: 1 / -1;
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}
</style>
