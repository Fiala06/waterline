<script lang="ts">
	// A tank's readings, care log and stocking as text to paste into an AI
	// assistant with a question. Nothing is sent anywhere from here.
	import { onMount } from 'svelte';
	import { toast } from '$lib/ui.svelte';
	let { data } = $props();
	const base = $derived(`/tanks/${data.tank.id}`);
	const PERIODS = [
		{ days: 30, label: '30 days' },
		{ days: 90, label: '90 days' },
		{ days: 365, label: '1 year' }
	];
	// Copy needs scripts; without them the text below can be selected, or downloaded.
	let scripted = $state(false);
	onMount(() => (scripted = true));

	async function copy() {
		try {
			await navigator.clipboard.writeText(data.text);
		} catch {
			// no clipboard API (a plain-HTTP server): copy from a selected text box instead
			const box = Object.assign(document.createElement('textarea'), { value: data.text, readOnly: true });
			box.style.cssText = 'position:fixed;opacity:0';
			document.body.append(box);
			box.select();
			const ok = document.execCommand('copy');
			box.remove();
			if (!ok) return toast("✕ Couldn't copy. Select the text below and copy it.");
		}
		toast('✓ Copied. Paste it into your AI assistant with your question.');
	}
</script>

<svelte:head><title>Summary for an AI assistant · {data.tank.name}</title></svelte:head>

<div class="wrap">
	<div class="top">
		<!-- on desktop the header has "Tanks › {tank} › Summary for an AI assistant" -->
		<a class="back hide-desk" href={base}>‹ {data.tank.name}</a>
		<h1 class="hide-desk">Summary for an AI assistant</h1>
		<p class="intro">
			Paste it into an AI assistant such as ChatGPT, Claude or Gemini, then ask your question, e.g. “Why does my nitrate keep climbing?” It has
			this tank's readings, care log and stocking, not your account details. Waterline doesn't send it anywhere.
		</p>
	</div>

	<div class="controls">
		<nav class="chips" aria-label="Covering">
			{#each PERIODS as p (p.days)}
				<a
					class="chip"
					class:selected={data.days === p.days}
					aria-current={data.days === p.days ? 'true' : undefined}
					href="?days={p.days}"
					data-sveltekit-replacestate
					data-sveltekit-noscroll>{p.label}</a
				>
			{/each}
		</nav>
		<div class="acts">
			<a class="btn" href="{base}/summary.md?days={data.days}" download>Download</a>
			{#if scripted}<button type="button" class="btn btn-primary" onclick={copy}>Copy summary</button>{/if}
		</div>
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_tabindex (it scrolls: keyboard users can too) -->
	<pre class="text" tabindex="0" aria-label="The summary">{data.text}</pre>
</div>

<style>
	.wrap {
		max-width: 760px;
		padding: 0 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.top {
		padding: 8px 0 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	.intro {
		margin: 8px 0 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.chips {
		display: flex;
		gap: 8px;
	}
	.acts {
		display: flex;
		gap: 10px;
	}
	.text {
		margin: 0;
		max-height: 70vh;
		overflow: auto;
		padding: 14px 16px;
		border-radius: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		font-family: ui-monospace, Menlo, monospace;
		font-size: 12.5px;
		line-height: 1.55;
		color: var(--text-2);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.text:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	/* phones: Copy is the main action, full width under the periods */
	@media (max-width: 1023px) {
		.acts {
			width: 100%;
		}
		.acts .btn {
			flex: 1;
			min-height: 48px;
		}
		.acts .btn-primary {
			order: -1;
			flex: 2;
		}
	}

	@media (min-width: 1024px) {
		.wrap {
			padding: 24px 32px;
		}
		.top {
			padding: 0;
		}
		.intro {
			margin: 0;
		}
		.text {
			max-height: none;
			font-size: 13px;
		}
	}
</style>
