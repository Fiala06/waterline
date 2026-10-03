<script lang="ts">
	// Share summary (get help): a tank's readings, care log and stocking as text to paste with
	// a question into a forum post, a message to a friend or your fish store,
	// or an AI chat (redesign README § 14). Nothing is sent anywhere from here.
	import { onMount } from 'svelte';
	import { toast } from '$lib/ui.svelte';
	let { data } = $props();
	const base = $derived(`/tanks/${data.tank.id}`);
	const PERIODS = [
		{ days: 30, label: '30 days' },
		{ days: 90, label: '90 days' },
		{ days: 365, label: '1 year' }
	];
	const lines = $derived(data.text.split('\n').length);
	const chars = $derived(data.text.length.toLocaleString('en-US'));
	// Copy needs scripts; without them the text below can be selected, or downloaded.
	let scripted = $state(false);
	onMount(() => (scripted = true));
	let copied = $state(false);

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
		copied = true;
		setTimeout(() => (copied = false), 2000);
		toast('✓ Copied. Paste it with your question.');
	}
</script>

<svelte:head><title>Share summary · {data.tank.name}</title></svelte:head>

<div class="wrap">
	<div class="top hide-desk">
		<a class="back" href={base}>‹ {data.tank.name}</a>
		<span class="kicker">{data.tank.name}</span>
		<h1>Share summary</h1>
	</div>
	<p class="intro">
		A summary of this tank to paste with your question, e.g. “Why does my nitrate keep climbing?”, into a forum post, a message to a friend or your fish store, or an
		AI chat. It has the readings, care log and stocking, not your account details. Waterline doesn't send it anywhere.
	</p>

	<div class="controls">
		<div class="group">
			<span class="gk">Format</span>
			<span class="segmented fmt" role="group" aria-label="Format"><span class="on">Forum / AI</span></span>
		</div>
		<div class="group">
			<span class="gk">Covering</span>
			<nav class="segmented covering" aria-label="Covering">
				{#each PERIODS as p (p.days)}
					<a class:on={data.days === p.days} aria-current={data.days === p.days ? 'true' : undefined} href="?days={p.days}" data-sveltekit-replacestate data-sveltekit-noscroll
						>{p.label}</a
					>
				{/each}
			</nav>
		</div>
		<span class="count">{lines} lines · {chars} characters</span>
		<div class="acts">
			<a class="btn" href="{base}/summary.md?days={data.days}" download>Download</a>
			{#if scripted}<button type="button" class="btn btn-primary" onclick={copy}>{copied ? '✓ Copied' : 'Copy summary'}</button>{/if}
		</div>
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_tabindex (it scrolls: keyboard users can too) -->
	<pre class="text" tabindex="0" aria-label="The summary">{data.text}</pre>
</div>

<style>
	.wrap {
		max-width: 820px;
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
	}
	.intro {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		max-width: 720px;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 14px;
	}
	.group {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.gk {
		font-size: 13px;
		color: var(--text-muted);
	}
	/* Format / Covering: one bordered row, the choice filled accent */
	.segmented {
		display: flex;
		min-height: 40px;
	}
	.segmented a,
	.segmented .on {
		display: inline-flex;
		align-items: center;
		min-height: 38px;
		padding: 0 14px;
		color: var(--text);
		font-size: 14px;
		font-weight: 600;
	}
	.segmented a + a {
		border-left: 1px solid var(--divider);
	}
	.segmented .on {
		background: var(--accent);
		color: var(--on-accent);
		font-weight: 800;
	}
	.count {
		font-size: 13px;
		color: var(--text-muted);
		margin-left: auto;
	}
	.acts {
		display: flex;
		gap: 8px;
	}
	.text {
		margin: 0;
		max-height: 70vh;
		overflow: auto;
		padding: 14px 16px;
		background: var(--surface);
		border: 1px solid var(--divider);
		font-family: ui-monospace, Menlo, monospace;
		font-size: 12.5px;
		line-height: 1.55;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.text:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	/* phones: Copy is the main action, full width under the periods */
	@media (max-width: 1023px) {
		.count {
			margin-left: 0;
			flex-basis: 100%;
		}
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
			padding: 16px 32px 32px;
		}
		.text {
			max-height: none;
			font-size: 13px;
		}
	}
</style>
