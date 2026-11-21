<script lang="ts">
	// Delete a tank for good (#304): an archived tank only, by its owner. What
	// goes, a backup first, then its name typed out. Once it's gone, this
	// device's offline copies of pages go too.
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	const f = $derived(data.footprint);
	const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
	const what = $derived(
		[
			n(f.tests, 'water test'),
			n(f.entries, 'History entry', 'History entries'),
			n(f.tasks, 'task'),
			n(f.livestock, 'livestock entry', 'livestock entries'),
			n(f.plants, 'plant'),
			n(f.equipment, 'piece of equipment', 'pieces of equipment')
		].join(', ')
	);
	let busy = $state(false);
</script>

<svelte:head><title>Delete tank · {f.tank.name}</title></svelte:head>

<div class="page del">
	<div class="head">
		<a class="back hide-desk" href="/tanks">‹ Tanks</a>
		<h1 class="hide-desk">Delete {f.tank.name}</h1>
		<p class="lede">This can't be undone. <a href="/settings/export?tank={f.tank.id}">Download a backup of this tank</a> first if you might want any of it.</p>
	</div>

	<section aria-labelledby="goes-h">
		<h2 id="goes-h" class="kicker rule">What's deleted</h2>
		<ul class="list">
			<li><b>{f.tank.name}</b>, with its {what}.</li>
			<li><b>{n(f.photos, 'photo')}</b> and <b>{n(f.receipts, 'receipt')}</b>, from this server.</li>
			<li>Its reminders, and the links in emails about it.</li>
			{#if f.public}<li>Its public page and photo links stop working.</li>{/if}
			{#if f.sharedWith}<li><b>{n(f.sharedWith, 'person', 'people')}</b> it's shared with lose it too.</li>{/if}
			<li>Backups you've built that hold it, on Import & export.</li>
		</ul>
	</section>

	<section aria-labelledby="stays-h">
		<h2 id="stays-h" class="kicker rule">What stays</h2>
		<ul class="list">
			<li>Your other tanks, and everything in them.</li>
			<li>Backups you've already downloaded, and the server's own backups if its admin keeps any, until they're replaced.</li>
		</ul>
	</section>

	<form
		method="POST"
		class="confirm"
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				// gone: the pages this device kept for offline use go too
				if (result.type === 'redirect') navigator.serviceWorker?.controller?.postMessage('clear-user-cache');
				await update();
				busy = false;
			};
		}}
	>
		<label class="label" for="del-name">To confirm, type the tank's name: <b>{f.tank.name}</b></label>
		<input
			class="input"
			id="del-name"
			name="name"
			autocomplete="off"
			spellcheck="false"
			value={form?.typed ?? ''}
			aria-invalid={!!form?.error}
			aria-describedby={form?.error ? 'del-err' : undefined}
		/>
		{#if form?.error}<p class="error-text" id="del-err" role="alert">✕ {form.error}</p>{/if}
		<button class="btn btn-danger" disabled={busy}>Delete tank for good</button>
	</form>
</div>

<style>
	.del {
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 640px;
		padding: 16px 16px 40px;
	}
	@media (min-width: 1024px) {
		.del {
			max-width: 704px;
			padding: 24px 32px 48px;
		}
	}
	.back {
		font-weight: 700;
		color: var(--accent-text);
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
	.lede {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
	}
	.rule {
		display: block;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
	}
	h2 {
		margin: 0;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li {
		padding: 10px 0;
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
		line-height: 1.5;
	}
	.confirm {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
	}
	.confirm .input {
		width: 100%;
	}
	a {
		text-decoration: underline;
	}
</style>
