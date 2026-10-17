<script lang="ts">
	// Scan a barcode (#147): the camera in the page, a photo read on the server,
	// or the number typed, all landing on ?code=… with what was found.
	import { goto } from '$app/navigation';
	import BarcodeScanner from '$lib/components/BarcodeScanner.svelte';
	let { data, form } = $props();
	const base = $derived(`/tanks/${data.tankId}`);
	const r = $derived(data.result);
	let looking = $state(false);
	// the result came: the reader's "Looking it up…" is over
	$effect(() => {
		void r;
		looking = false;
	});
	function read(code: string) {
		// the same box again: its result is already here
		if (r && 'code' in r && r.code === code) return;
		looking = true;
		void goto(`${base}/equipment/scan?code=${code}`, { invalidateAll: true });
	}
</script>

<svelte:head><title>Scan a barcode · Waterline</title></svelte:head>

<div class="scan">
	<div class="bar hide-desk">
		<a class="cancel" href="{base}/equipment">Cancel</a>
		<h1>Scan a barcode</h1>
		<span></span>
	</div>
	<div class="body">
		{#if r && r.status !== 'invalid'}
			<section class="result" aria-labelledby="result-h">
				{#if r.status === 'existing'}
					{@const first = r.items[0]}
					<h2 class="kicker" id="result-h">✓ Already in {first.here ? 'this tank' : first.tankName}</h2>
					<p class="name">{first.name}</p>
					<p class="sub">Barcode {r.code}{#if r.items.length > 1} · also {r.items.slice(1).map((i) => `${i.name} in ${i.tankName}`).join(', ')}{/if}</p>
					<div class="acts">
						<a class="btn btn-primary" href="/tanks/{first.tankId}/equipment/{first.id}">Open<span class="sr-only"> {first.name}</span></a>
						<a class="btn" href="{base}/equipment/new?barcode={r.code}">Add another anyway</a>
					</div>
				{:else if r.status === 'found'}
					<h2 class="kicker" id="result-h">✓ Found</h2>
					<p class="name">{[r.brand, r.model].filter(Boolean).join(' ')}</p>
					<p class="sub">{r.title}</p>
					<p class="sub">{r.type} · from {r.source} · barcode {r.code}</p>
					<div class="acts">
						<a class="btn btn-primary" href="{base}/equipment/new?barcode={r.code}">Add to tank</a>
						<a class="btn" href="{base}/equipment/scan">Scan again</a>
					</div>
					<p class="hint">Check the type, brand and model on the next page; nothing is saved until you do.</p>
				{:else if r.status === 'none'}
					<h2 class="kicker" id="result-h">– Nothing found</h2>
					<p class="sub">No product with barcode {r.code} in Open Products Facts or UPCitemdb. Add it by hand: the barcode stays with the item, so scanning the box again finds it.</p>
					<div class="acts">
						<a class="btn btn-primary" href="{base}/equipment/new?barcode={r.code}">Add by hand</a>
						<a class="btn" href="{base}/equipment/scan">Scan again</a>
					</div>
				{:else if r.status === 'off'}
					<h2 class="kicker" id="result-h">– Lookup is off</h2>
					<p class="sub">Barcode lookup is off on this server{data.admin ? ': turn it on under Server settings › Features' : ''}. The barcode {r.code} stays with what you add.</p>
					<div class="acts">
						<a class="btn btn-primary" href="{base}/equipment/new?barcode={r.code}">Add by hand</a>
						<a class="btn" href="{base}/equipment/scan">Scan again</a>
					</div>
				{:else}
					<h2 class="kicker" id="result-h">✕ Couldn't look it up</h2>
					<p class="sub">{r.reason}. Try again in a moment, or add it by hand with the barcode {r.code} kept.</p>
					<div class="acts">
						<a class="btn btn-primary" href="{base}/equipment/scan?code={r.code}">Try again</a>
						<a class="btn" href="{base}/equipment/new?barcode={r.code}">Add by hand</a>
					</div>
				{/if}
			</section>
		{/if}
		{#if !r || r.status !== 'found'}
			<BarcodeScanner onCode={read} {looking} error={form?.photoError ?? null} />
			<form method="GET" class="typed">
				<div class="field">
					<label class="label" for="code">Or type the number under the barcode</label>
					<div class="row">
						<input class="input" id="code" name="code" inputmode="numeric" autocomplete="off" value={data.raw} aria-invalid={r?.status === 'invalid'} />
						<button class="btn">Look it up</button>
					</div>
					{#if r?.status === 'invalid'}<span class="error-text" role="alert">✕ That doesn't look like a product barcode: check the digits.</span>{/if}
				</div>
			</form>
		{/if}
	</div>
</div>

<style>
	.scan {
		display: flex;
		flex-direction: column;
		max-width: 560px;
	}
	.bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 4px 20px 8px;
	}
	.cancel {
		justify-self: start;
		font-size: 16px;
		color: var(--text-muted);
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
	}
	.body {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.result {
		border-top: 2px solid var(--ink);
		padding-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.result .kicker {
		margin: 0;
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.name {
		margin: 0;
		font-size: 20px;
		font-weight: 800;
	}
	.sub {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 6px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	.typed {
		padding-top: 12px;
		border-top: 1px solid var(--divider);
	}
	.row {
		display: flex;
		gap: 8px;
	}
	.row .input {
		flex: 1;
		min-width: 0;
	}
	@media (min-width: 1024px) {
		.body {
			padding: 8px 32px 32px;
		}
	}
</style>
