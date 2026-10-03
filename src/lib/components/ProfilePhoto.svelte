<script lang="ts">
	// Settings › Profile: your photo. Upload one (camera or library on a phone)
	// with a round preview before it's saved, go back to the Google photo, or
	// remove it for initials. Plain forms, so it works without scripts too.
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onMount } from 'svelte';
	import { initialsOf } from './AccountMenu.svelte';
	import { shrinkImage } from '$lib/media';

	let {
		user,
		error = ''
	}: {
		user: { displayName: string; email: string; avatar: string | null; avatarKind: 'google' | 'own' | null; hasGooglePhoto: boolean };
		error?: string;
	} = $props();

	let input = $state<HTMLInputElement>();
	let preview = $state<string | null>(null);
	let unreadable = $state(false); // the browser can't show it, but the server may read it
	let busy = $state(false);
	let ready = $state(false);
	onMount(() => {
		ready = true;
		return () => preview && URL.revokeObjectURL(preview);
	});

	const initials = $derived(initialsOf(user.displayName, user.email));
	const about = $derived(
		preview ? 'Preview' : user.avatarKind === 'own' ? 'Your own photo' : user.avatarKind === 'google' ? 'From your Google account' : 'Your initials'
	);

	async function chose() {
		const file = input?.files?.[0];
		if (!input || !file) return;
		// 1024px is plenty for a 192px photo, and keeps the upload small
		const small = await shrinkImage(file, 1024, 1_000_000);
		if (small !== file) {
			const dt = new DataTransfer();
			dt.items.add(small);
			input.files = dt.files;
		}
		if (preview) URL.revokeObjectURL(preview);
		preview = URL.createObjectURL(small);
		unreadable = false;
	}
	function cancel() {
		if (input) input.value = '';
		if (preview) URL.revokeObjectURL(preview);
		preview = null;
	}
	const submit: SubmitFunction = () => {
		busy = true;
		return async ({ result, update }) => {
			busy = false;
			if (result.type !== 'failure') cancel();
			await update();
		};
	};
</script>

<span class="face" aria-hidden="true">
	{#if preview && !unreadable}
		<img src={preview} alt="" onerror={() => (unreadable = true)} />
	{:else if !preview && user.avatar}
		<img src={user.avatar} alt="" />
	{:else}
		{initials}
	{/if}
</span>
<div class="body">
	<span class="k">Profile photo</span>
	<span class="about">{about} · shown on your public tank pages</span>
	<div class="acts">
		<form method="POST" action="?/photo" enctype="multipart/form-data" use:enhance={submit}>
			<input bind:this={input} id="photo-file" class="sr-only" type="file" name="photo" accept="image/*" aria-label="Choose a photo" onchange={chose} />
			{#if preview}
				<button class="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save photo'}</button>
				<button type="button" class="btn" onclick={cancel} disabled={busy}>Cancel</button>
			{:else}
				<label class="btn" for="photo-file">{user.avatarKind ? 'Change photo' : 'Add photo'}</label>
				<!-- without scripts there's no preview: choose, then save -->
				{#if !ready}<button class="btn btn-primary">Save photo</button>{/if}
			{/if}
		</form>
		{#if !preview && user.hasGooglePhoto && user.avatarKind !== 'google'}
			<form method="POST" action="?/googlePhoto" use:enhance={submit}>
				<button class="btn" disabled={busy}>Use my Google photo</button>
			</form>
		{/if}
		{#if !preview && user.avatarKind}
			<form method="POST" action="?/removePhoto" use:enhance={submit}>
				<button class="btn-text" disabled={busy}>Remove photo</button>
			</form>
		{/if}
	</div>
	{#if error}<p class="error-text" role="alert">✕ {error}</p>{/if}
</div>

<style>
	/* a 64px square in ink, with the initials in the page colour (README § 15) */
	.face {
		flex-shrink: 0;
		align-self: flex-start;
		width: 64px;
		height: 64px;
		margin-right: 16px;
		border-radius: 0;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--ink);
		color: var(--bg);
		font-size: 20px;
		font-weight: 800;
		letter-spacing: 0.02em;
	}
	.k {
		font-weight: 800;
	}
	.face img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.about {
		font-size: 13px;
		color: var(--text-muted);
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
	}
	.acts form {
		display: flex;
		gap: 8px;
	}
	.acts label.btn {
		cursor: pointer;
	}
	/* the file input is hidden, so show its focus on the button that opens it */
	.acts input:focus-visible + label {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.error-text {
		margin: 8px 0 0;
	}
</style>
