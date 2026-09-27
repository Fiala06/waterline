<script lang="ts">
	// A pet's page ("Captain · Betta"), or a species' group: its photo, name,
	// notes and History. Naming one of a group moves it out onto its own page.
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onMount } from 'svelte';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import { photoUrl, shrinkImage } from '$lib/media';

	let { data, form } = $props();
	const a = $derived(data.animal);
	const list = $derived(`/tanks/${data.tank.id}/livestock`);
	const KIND: Record<string, string> = { fish: 'Fish', invert: 'Invert', coral: 'Coral' };
	const title = $derived(a.nickname ?? a.commonName);
	const one = $derived(a.count === 1 || !!a.nickname);
	const gone = $derived(!!a.left);

	let busy = $state(false);
	let ready = $state(false);
	onMount(() => (ready = true));
	const saving: SubmitFunction = () => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	};

	// choosing a photo saves it (without scripts: choose, then Save photo)
	let photoInput = $state<HTMLInputElement>();
	async function chosePhoto() {
		const file = photoInput?.files?.[0];
		if (!photoInput || !file) return;
		const small = await shrinkImage(file, 2560);
		if (small !== file) {
			const dt = new DataTransfer();
			dt.items.add(small);
			photoInput.files = dt.files;
		}
		photoInput.form?.requestSubmit();
	}
	// "−1 Corydoras · loss": the part after the first " · " is muted
	function split(t: string) {
		const i = t.indexOf(' · ');
		return i < 0 ? [t, ''] : [t.slice(0, i), t.slice(i + 3)];
	}
</script>

<svelte:head><title>{a.nickname ? `${a.nickname} · ${a.commonName}` : a.commonName} · {data.tank.name}</title></svelte:head>

<div class="pet">
	<!-- phones; on desktop the header has the title -->
	<div class="bar hide-desk">
		<a class="back" href={list}>‹ Livestock</a>
	</div>

	<div class="hero">
		{#if a.photoId}
			<a class="pic" href="/photos/{a.photoId}" aria-label="Photo of {title}"><img src={photoUrl(a.photoId)} alt="" /></a>
		{:else}
			<span class="pic none" aria-hidden="true"><CategoryIcon kind="livestock" size={40} /></span>
		{/if}
		<div class="who">
			<h1>{title}{#if !one}<span class="count">{' ×' + a.count}</span>{/if}</h1>
			<p class="species">
				{#if a.nickname}{a.commonName}{/if}{#if a.nickname && a.scientificName}{' · '}{/if}{#if a.scientificName}<i>{a.scientificName}</i>{/if}
			</p>
			<p class="facts">
				<span>{KIND[a.kind]}</span>
				{#if a.added}<span>Added {a.added}</span>{/if}
				{#if gone}<span class="status-tag tag-none sm">Left {a.left}</span>
				{:else if a.status === 'quarantine'}<span class="status-tag tag-warn sm">▲ Quarantine</span>
				{:else}<span class="in-tank">✓ In tank</span>{/if}
			</p>
		</div>
	</div>

	{#if !gone}
		<div class="photo-acts">
			<form method="POST" action="?/photo" enctype="multipart/form-data" use:enhance={saving}>
				<input bind:this={photoInput} id="pet-photo" class="sr-only" type="file" name="photo" accept="image/*" aria-label="Choose a photo" onchange={chosePhoto} />
				<label class="btn" for="pet-photo" aria-disabled={busy}>{busy ? 'Saving…' : a.photoId ? 'Change photo' : 'Add photo'}</label>
				{#if !ready}<button class="btn btn-primary">Save photo</button>{/if}
			</form>
			{#if a.photoId}
				<form method="POST" action="?/removePhoto" use:enhance={saving}><button class="btn-text" disabled={busy}>Remove photo</button></form>
			{/if}
		</div>
		{#if form?.photoError}<p class="error-text" role="alert">✕ {form.photoError}</p>{/if}
	{/if}

	{#if !gone && !one}
		<form class="card name-one" method="POST" action="?/nameOne" use:enhance={saving}>
			<label class="label" for="name-one">Name one of them</label>
			<div class="inline">
				<input class="input" id="name-one" name="nickname" maxlength="60" autocomplete="off" placeholder="Pepper" aria-invalid={!!form?.nameError} />
				<button class="btn btn-primary" disabled={busy}>Name</button>
			</div>
			{#if form?.nameError}<p class="error-text" role="alert">✕ {form.nameError}</p>{/if}
			<p class="hint">Takes one of your {a.count} {a.commonName} into its own entry, with its own photo, notes and history.</p>
		</form>
	{/if}

	<form class="details" method="POST" action="?/save" use:enhance={saving}>
		{#if one && !gone}
			<div class="field">
				<label class="label" for="nickname">Name</label>
				<input class="input" id="nickname" name="nickname" maxlength="60" autocomplete="off" defaultValue={a.nickname ?? ''} placeholder="Give it a name" />
			</div>
		{/if}
		<div class="field">
			<label class="label" for="notes">Notes</label>
			<textarea class="input" id="notes" name="notes" rows="3" maxlength="4000" defaultValue={a.notes} placeholder="Personality, favourite food, where it hides"></textarea>
		</div>
		<div class="foot"><button class="btn btn-primary" disabled={busy}>Save</button></div>
	</form>

	<section class="history" aria-labelledby="history-h">
		<h2 id="history-h">History</h2>
		{#if data.history.length}
			<ul>
				{#each data.history as h (h.id)}
					{@const [what, detail] = split(h.title)}
					<li>
						<a href="/entries/event/{h.id}">
							<span class="t">{what}{#if detail}<span class="muted">{' · ' + detail}</span>{/if}</span>
							<span class="d">{h.day}</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="none">Nothing logged yet</p>
		{/if}
	</section>
</div>

<style>
	.pet {
		max-width: 640px;
		padding: 0 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.bar {
		padding: 8px 0 0;
	}
	.back {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		font-size: 15px;
		color: var(--text-muted);
	}
	.hero {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.pic {
		flex-shrink: 0;
		width: 96px;
		height: 96px;
		border-radius: 50%;
		overflow: hidden;
		background: var(--surface);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.pic img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.who {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	h1 {
		margin: 0;
		font-size: 26px;
		font-weight: 700;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}
	.count {
		font-weight: 600;
		color: var(--text-muted);
	}
	.species {
		margin: 0;
		font-size: 15px;
		color: var(--text-muted);
	}
	.species:empty {
		display: none;
	}
	.facts {
		margin: 2px 0 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 12px;
		font-size: 14px;
		color: var(--text-muted);
	}
	.in-tank {
		color: var(--ok);
		font-weight: 600;
	}
	.photo-acts {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.photo-acts form {
		display: flex;
		gap: 8px;
	}
	.photo-acts label.btn {
		cursor: pointer;
	}
	.photo-acts input:focus-visible + label {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.error-text {
		margin: -8px 0 0;
	}
	.name-one {
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.name-one .error-text {
		margin: 0;
	}
	.inline {
		display: flex;
		gap: 8px;
	}
	.inline .input {
		flex: 1;
		min-width: 0;
	}
	.inline .btn {
		height: auto;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
		line-height: 1.5;
	}
	.details {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.foot {
		display: flex;
		justify-content: flex-end;
	}
	.foot .btn {
		min-width: 120px;
	}
	.history h2 {
		margin: 8px 0 8px;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.history ul {
		margin: 0;
		padding: 0;
		list-style: none;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.history li + li {
		border-top: 1px solid var(--border);
	}
	.history a {
		min-height: 50px;
		padding: 10px 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		color: var(--text);
	}
	.history .t {
		min-width: 0;
	}
	.history .d {
		flex-shrink: 0;
		font-size: 13px;
		color: var(--text-faint);
	}
	.none {
		margin: 0;
		font-size: 14px;
		color: var(--text-faint);
	}
	/* Desktop: a centered card (the header has the title) */
	@media (min-width: 1024px) {
		.pet {
			margin: 28px auto;
			padding: 24px 28px;
			background: var(--surface);
			border: 1px solid var(--border);
			border-radius: 20px;
		}
		.pet :global(.input) {
			background-color: var(--surface-2);
			border-color: var(--border-strong);
		}
		.pic,
		.name-one,
		.history ul {
			background: var(--surface-2);
		}
	}
</style>
