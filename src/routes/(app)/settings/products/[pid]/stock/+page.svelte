<script lang="ts">
	// A saved product's stock (#318): what's left, how that's known (measured,
	// or estimated from the doses logged in mL since), refills, the low mark and
	// its alert, and the log.
	import { enhance } from '$app/forms';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import { refusal, keepValues } from '$lib/forms';
	let { data, form } = $props();
	const measure = $derived(refusal(form, 'measure'));
	const refill = $derived(refusal(form, 'refill'));
	const low = $derived(refusal(form, 'low'));
</script>

<svelte:head><title>{data.product.name} stock · Settings · Waterline</title></svelte:head>

<div class="page sub-page stock">
	<div class="head">
		<a class="back sub-back" href="/settings/products">‹ Products</a>
		<h1>{data.product.name}</h1>
		<p class="lede">What's left in the bottle, in mL. Doses you log in mL under this exact name, in your own tanks, are taken off; doses in other units aren't.</p>
	</div>

	{#if data.stock}
		<section aria-labelledby="left-h">
			<h2 id="left-h" class="kicker rule">Left</h2>
			<p class="left num">{data.stock.left}</p>
			{#if data.stock.status}<p class="status">{data.stock.status}</p>{/if}
			<p class="how">{data.stock.how}</p>
		</section>
	{/if}

	<section aria-labelledby="measure-h">
		<h2 id="measure-h" class="kicker rule">{data.stock ? 'Update' : 'Track what’s left'}</h2>
		<div class="forms">
			<form method="POST" action="?/measure" use:enhance={keepValues}>
				<label class="label" for="m-ml">{data.stock ? 'Measured: there’s this much now' : 'How much is in the bottle'}</label>
				<div class="inline">
					<input class="input" id="m-ml" name="ml" inputmode="decimal" autocomplete="off" placeholder="mL" defaultValue={String(measure.values.ml ?? '')} aria-invalid={!!measure.message} />
					<button class="btn">{data.stock ? 'Save' : 'Start tracking'}</button>
				</div>
				{#if measure.message}<p class="error-text" role="alert">✕ {measure.message}</p>{/if}
			</form>
			{#if data.stock}
				<form method="POST" action="?/refill" use:enhance={keepValues}>
					<label class="label" for="r-ml">Refilled: added this much</label>
					<div class="inline">
						<input class="input" id="r-ml" name="ml" inputmode="decimal" autocomplete="off" placeholder="mL" defaultValue={String(refill.values.ml ?? '')} aria-invalid={!!refill.message} />
						<button class="btn">Add</button>
					</div>
					{#if refill.message}<p class="error-text" role="alert">✕ {refill.message}</p>{/if}
				</form>
			{/if}
		</div>
	</section>

	{#if data.stock}
		<section aria-labelledby="low-h">
			<h2 id="low-h" class="kicker rule">Running low</h2>
			<form class="lowf" method="POST" action="?/low" use:enhance={keepValues}>
				<label class="label" for="low-ml">Low below · optional</label>
				<div class="inline">
					<input class="input" id="low-ml" name="lowMl" inputmode="decimal" autocomplete="off" placeholder="mL" defaultValue={String(low.values.lowMl ?? data.product.lowMl)} aria-invalid={!!low.message} />
				</div>
				<label class="check-row">
					<input type="checkbox" name="lowAlert" checked={data.product.lowAlert} />
					<span>Tell me under Alerts when it's below that</span>
				</label>
				{#if low.message}<p class="error-text" role="alert">✕ {low.message}</p>{/if}
				<button class="btn">Save</button>
			</form>
		</section>

		<section aria-labelledby="log-h">
			<h2 id="log-h" class="kicker rule">Log</h2>
			<ul class="log">
				{#each data.log as r (r.id)}
					<li>
						<span>{r.day} · {r.text}{r.note ? ` · ${r.note}` : ''}</span>
						<form method="POST" action="?/deleteEntry" use:enhance>
							<input type="hidden" name="id" value={r.id} />
							<button class="btn-text" aria-label="Delete {r.text} on {r.day}">Delete</button>
						</form>
					</li>
				{/each}
			</ul>
			<ConfirmDelete id="stop-stock" title="Stop tracking {data.product.name}?" body="Its stock log goes, and the low alert with it. The product and its doses stay." action="?/stop" label="Stop tracking" />
		</section>
	{/if}
</div>

<style>
	.stock {
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 640px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
	}
	.lede,
	.how {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.rule {
		display: block;
		margin: 0 0 10px;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
	}
	h2 {
		margin: 0;
	}
	.left {
		margin: 0;
		font-size: 34px;
		font-weight: 800;
	}
	.status {
		margin: 4px 0;
		font-weight: 700;
	}
	.forms {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: flex-start;
	}
	.inline {
		display: flex;
		gap: 8px;
		width: 100%;
	}
	.inline .input {
		flex: 1;
		min-width: 0;
		height: 44px;
	}
	.inline .btn,
	.lowf .btn {
		min-height: 44px;
	}
	.log {
		list-style: none;
		margin: 0 0 12px;
		padding: 0;
	}
	.log li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 44px;
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
	}
</style>
