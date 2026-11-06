<script lang="ts">
	// Smart plug (#203): the Shelly plug an item runs from, its state, and the
	// address and password Waterline reads and switches it with.
	import { enhance } from '$app/forms';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	let { data, form } = $props();
	let busy = $state(false);
	const back = $derived(`/tanks/${data.item.tankId}/equipment`);
</script>

<svelte:head><title>Smart plug · {data.item.name}</title></svelte:head>

<div class="page">
	<!-- phones; on desktop the header has the title -->
	<div class="bar hide-desk">
		<a class="cancel" href={back}>Back</a>
		<h1>Smart plug</h1>
		<span aria-hidden="true"></span>
	</div>
	<div class="body">
		<p class="lede">{data.item.name}</p>
		{#if data.off}<p class="banner banner-warn" role="status">▲ Reading devices is switched off on this server, so the plug isn't read and Pause doesn't switch it.</p>{/if}
		{#if data.plug}
			<section class="state" aria-labelledby="state-h">
				<h2 class="kicker" id="state-h">{data.plug.name ?? 'Shelly plug'}</h2>
				<div class="row"><span class="k">Now</span><span class="v status-{data.plug.status.level}">{data.plug.status.text}</span></div>
				{#if data.plug.error}<div class="row"><span class="k">Problem</span><span class="v">{data.plug.error}{data.plug.lastOk ? ` · last answered ${data.plug.lastOk}` : ''}</span></div>{/if}
				<div class="row"><span class="k">Address</span><span class="v">{data.plug.url}{data.plug.hasPassword ? ' · with its password' : ''}</span></div>
				{#if data.plug.checked}<div class="row"><span class="k">Checked</span><span class="v">{data.plug.checked}</span></div>{/if}
				<div class="acts">
					<form method="POST" action="?/check" use:enhance><button class="btn">Check now</button></form>
					<button type="button" class="btn" popovertarget="plug-unlink">Unlink</button>
				</div>
			</section>
		{/if}
		<form
			method="POST"
			action="?/save"
			class="link"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update();
					busy = false;
				};
			}}
		>
			<h2 class="kicker">{data.plug ? 'Change the plug' : 'Link a Shelly plug'}</h2>
			{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}
			<div class="field">
				<label class="label" for="plug-url">Plug address</label>
				<input class="input" id="plug-url" name="url" required autocomplete="off" inputmode="url" placeholder="192.168.1.40" value={form?.values?.url ?? data.plug?.url ?? ''} />
				<span class="hint">The plug's address on your network, from the Shelly app (Settings › Device information) or your router. Waterline needs to reach it from the server.</span>
			</div>
			<div class="field">
				<label class="label" for="plug-password">Password · optional</label>
				<input class="input" id="plug-password" name="password" type="password" autocomplete="new-password" placeholder={data.plug?.hasPassword ? 'Leave blank to keep it' : ''} />
				<span class="hint">Only if you set one for the plug in the Shelly app.</span>
			</div>
			<p class="hint">
				Every 5 minutes Waterline reads the plug. When it's off, {data.item.name} is paused and stays in Needs attention; when it's back on, it resumes. Turn off and Turn on on its card switch the plug. Works with Shelly plugs from Gen2 on (Plus, Gen3, Gen4).
			</p>
			<button class="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Reaching the plug…' : data.plug ? 'Save' : 'Link plug'}</button>
		</form>
	</div>
</div>

{#if data.plug}
	<ConfirmDelete
		id="plug-unlink"
		trigger={false}
		title="Unlink the plug?"
		body="Waterline stops reading and switching it. {data.item.name} keeps its paused state, and Pause and Resume no longer touch the plug."
		action="?/unlink"
		label="Unlink"
		tone="warn"
	/>
{/if}

<style>
	.page {
		max-width: 560px;
	}
	.bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 8px 20px;
	}
	.cancel {
		font-size: 15px;
		color: var(--text-muted);
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-self: start;
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
	}
	.body {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.lede {
		margin: 0;
		font-size: 20px;
		font-weight: 800;
	}
	.state,
	.link {
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.link {
		gap: 16px;
	}
	.kicker {
		margin: 0;
		padding-bottom: 8px;
		border-bottom: 2px solid var(--ink);
	}
	.link .kicker {
		margin-bottom: -6px;
	}
	.row {
		display: grid;
		grid-template-columns: 96px minmax(0, 1fr);
		gap: 12px;
		min-height: 44px;
		align-items: center;
		border-bottom: 1px solid var(--divider);
		font-size: 15px;
	}
	.k {
		font-size: 13px;
		color: var(--text-muted);
	}
	.v {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.acts {
		display: flex;
		gap: 8px;
		padding-top: 12px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	@media (min-width: 1024px) {
		.page {
			max-width: 880px;
			padding: 24px 32px 48px;
		}
		.body {
			padding: 0;
			max-width: 560px;
		}
	}
</style>
