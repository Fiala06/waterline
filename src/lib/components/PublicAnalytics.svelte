<script lang="ts">
	// GA4 on public pages only (P5). With the consent banner on, nothing loads
	// until the visitor chooses Allow; the choice is remembered on this device.
	import { onMount } from 'svelte';
	let { ga4Id, consent }: { ga4Id: string | null; consent: boolean } = $props();

	const KEY = 'wl_analytics_consent';
	let ask = $state(false);

	function load() {
		if (!ga4Id || (window as { gtag?: unknown }).gtag) return;
		const s = document.createElement('script');
		s.async = true;
		s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`;
		document.head.appendChild(s);
		const w = window as unknown as { dataLayer: unknown[]; gtag: (...a: unknown[]) => void };
		w.dataLayer = w.dataLayer || [];
		w.gtag = function () {
			// eslint-disable-next-line prefer-rest-params
			w.dataLayer.push(arguments);
		};
		w.gtag('js', new Date());
		w.gtag('config', ga4Id, { anonymize_ip: true });
	}

	function choose(allow: boolean) {
		try {
			localStorage.setItem(KEY, allow ? 'yes' : 'no');
		} catch {
			/* storage blocked */
		}
		ask = false;
		if (allow) load();
	}

	onMount(() => {
		if (!ga4Id) return;
		if (!consent) return load();
		let saved: string | null = null;
		try {
			saved = localStorage.getItem(KEY);
		} catch {
			/* storage blocked */
		}
		if (saved === 'yes') load();
		else if (saved !== 'no') ask = true;
	});
</script>

{#if ask}
	<div class="consent card" role="dialog" aria-label="Analytics cookies">
		<strong>Allow analytics cookies?</strong>
		<span class="muted">Helps the owner see how many people visit. Nothing loads unless you allow it.</span>
		<div class="row">
			<button type="button" class="btn" onclick={() => choose(false)}>No</button>
			<button type="button" class="btn btn-primary" onclick={() => choose(true)}>Allow</button>
		</div>
	</div>
{/if}

<style>
	.consent {
		position: fixed;
		left: 12px;
		right: 12px;
		bottom: calc(12px + env(safe-area-inset-bottom));
		z-index: 40;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		box-shadow: var(--shadow-modal);
		max-width: 420px;
		margin: 0 auto;
		font-size: 14px;
	}
	.row {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		margin-top: 6px;
	}
</style>
