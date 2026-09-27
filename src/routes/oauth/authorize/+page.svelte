<script lang="ts">
	// "Connect Claude to Waterline?": which app, where it returns to, the tanks
	// it may read. Read-only, and disconnected in Settings › AI assistant.
	import Logo from '$lib/components/Logo.svelte';
	let { data, form } = $props();
	const picked = $derived(new Set<string>(form?.picked ?? data.tanks?.map((t) => t.id) ?? []));
</script>

<svelte:head><title>Connect {data.app ?? 'an app'} · Waterline</title></svelte:head>

<main class="wrap">
	<div class="consent">
		<Logo size={40} wordmark />
		{#if data.problem}
			<h1>Can't connect</h1>
			<p class="banner banner-bad" role="alert">✕ {data.problem}</p>
			<a class="btn btn-lg" href="/settings/assistant">Go to Waterline</a>
		{:else}
			<h1>Connect {data.app} to Waterline?</h1>
			<p class="lede">
				<strong>{data.app}</strong> wants to read your tanks, to answer questions about them. It can read readings, History, livestock, plants, trends
				and photos, and can't change anything.
			</p>
			{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}
			<form method="POST" action="?/allow&{data.q}" id="allow">
				{#if data.tanks?.length}
					<fieldset>
						<legend class="label">Tanks it can read</legend>
						{#each data.tanks as t (t.id)}
							<label class="check-row"><input type="checkbox" name="tank" value={t.id} checked={picked.has(t.id)} /><span>{t.name}</span></label>
						{/each}
					</fieldset>
				{:else}
					<p class="muted">You don't have a tank to share yet.</p>
				{/if}
			</form>
			<p class="small muted">
				You'll go back to <strong class="mono">{data.returnsTo}</strong>. Disconnect it any time in Settings › AI assistant. Signed in as {data.email}.
			</p>
			<div class="acts">
				<form method="POST" action="?/cancel&{data.q}">
					<button class="btn btn-lg">Cancel</button>
				</form>
				{#if data.tanks?.length}<button class="btn btn-lg btn-primary" form="allow">Allow</button>{/if}
			</div>
		{/if}
	</div>
</main>

<style>
	.wrap {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
	}
	.consent {
		width: 100%;
		max-width: 460px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	h1 {
		margin: 8px 0 0;
		font-size: 26px;
		font-weight: 600;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}
	.lede {
		margin: 0;
		font-size: 16px;
		line-height: 1.5;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.lede strong {
		color: var(--text);
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	legend {
		padding: 0;
		margin-bottom: 6px;
	}
	.small {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.small strong {
		color: var(--text);
	}
	.acts {
		display: flex;
		gap: 12px;
	}
	.acts > * {
		flex: 1;
	}
	.acts form .btn,
	.acts > .btn {
		width: 100%;
	}
	@media (min-width: 1024px) {
		.consent {
			padding: 28px 32px;
			border-radius: 20px;
			background: var(--surface);
			border: 1px solid var(--border);
		}
	}
</style>
