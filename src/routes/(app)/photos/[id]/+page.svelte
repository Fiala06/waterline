<script lang="ts">
	// The lightbox (README → Photos): prev/next with the arrow keys, the date
	// and entry, Set as cover and Delete. The stage is dark in both themes; the
	// panel, caption and sheet use the normal theme colors.
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import { photoUrl } from '$lib/media';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { data, form } = $props();
	let menu = $state(false);
	let changingDate = $state(false);
	let copied = $state(false);
	const share = $derived(data.sharing?.share ?? null);
	const shareUrl = $derived(share && data.sharing ? `${data.sharing.base}/s/${share.id}` : '');
	const download = $derived(`${photoUrl(data.photo.id, 'full')}?download`);

	async function copy(e: MouseEvent) {
		const field = (e.currentTarget as HTMLElement).parentElement?.querySelector('input');
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			field?.select(); // clipboard blocked: select it so it can be copied by hand
		}
	}
	// Options save as they change: keep what was just ticked instead of resetting the form.
	const keep: SubmitFunction = () => async ({ update }) => update({ reset: false });
	const closeMenu: SubmitFunction = () => {
		menu = false;
		return async ({ update }) => update();
	};

	function onkeydown(e: KeyboardEvent) {
		if (menu || e.metaKey || e.ctrlKey || e.altKey) return;
		if ((e.target as HTMLElement).closest('input, textarea, select, dialog, [popover]')) return;
		if (document.querySelector('[popover]:popover-open')) return;
		if (e.key === 'ArrowLeft' && data.prev) goto(`/photos/${data.prev}`, { replaceState: true });
		if (e.key === 'ArrowRight' && data.next) goto(`/photos/${data.next}`, { replaceState: true });
		if (e.key === 'Escape') goto('/photos');
	}
</script>

<svelte:window {onkeydown} />
<svelte:head><title>Photo {data.position} · Waterline</title></svelte:head>

{#snippet cover(cls: string)}
	{#if data.photo.isCover}
		<span class="{cls} is-cover" aria-disabled="true">✓ Tank cover</span>
	{:else}
		<form method="POST" action="?/cover" use:enhance={closeMenu}><button class={cls}>Set as cover</button></form>
	{/if}
{/snippet}

{#snippet shareCard(where: string)}
	{#if data.sharing}
		<div class="share" class:on={!!share}>
			<div class="s-head">
				<span class="s-title" id="share-{where}">Public link</span>
				<!-- a submit button drawn as a switch, so it works without JavaScript too -->
				<form method="POST" action={share ? '?/unshare' : '?/share'} use:enhance>
					<button class="switch" role="switch" aria-checked={!!share} aria-labelledby="share-{where}"><span></span></button>
				</form>
			</div>
			{#if share}
				<div class="s-row">
					<input
						class="s-url mono"
						readonly
						value={shareUrl.replace(/^https?:\/\//, '')}
						aria-label="Link address"
						onfocus={(e) => e.currentTarget.select()}
					/>
					<button type="button" class="btn btn-primary s-copy" onclick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
				</div>
				<form method="POST" action="?/shareOptions" use:enhance={keep} class="s-opts">
					<label class="check-row">
						<input type="checkbox" name="includeNote" checked={share.includeNote} onchange={(e) => e.currentTarget.form?.requestSubmit()} />
						<span>Include note and date</span>
					</label>
					<label class="check-row">
						<input type="checkbox" name="includeTank" checked={share.includeTank} onchange={(e) => e.currentTarget.form?.requestSubmit()} />
						<span>Include tank name</span>
					</label>
					<noscript><button class="btn s-save">Save</button></noscript>
				</form>
				<p class="s-note">Anyone with the link can view this photo. There's no sign-in, and readings and other entries stay private. Turn the link off to revoke it.</p>
			{:else}
				<p class="s-note">Share just this photo with a link. No sign-in needed to view it.</p>
			{/if}
		</div>
	{/if}
{/snippet}

<div class="viewer">
	<div class="bar hide-desk">
		<a class="round" href="/photos" aria-label="Close">✕</a>
		<span class="pos">{data.position}</span>
		<!-- opens the sheet; without JavaScript it jumps to the same actions below the caption -->
		<a
			class="round more"
			href="#photo-tools"
			aria-label="More"
			aria-haspopup="dialog"
			aria-expanded={menu}
			onclick={(e) => {
				e.preventDefault();
				menu = true;
			}}>•••</a
		>
	</div>

	<div class="stage">
		<img src={photoUrl(data.photo.id, 'full')} width={data.photo.width} height={data.photo.height} alt={data.entry?.title ?? 'Tank photo'} />
		{#if data.prev}<a class="nav prev" href="/photos/{data.prev}" data-sveltekit-replacestate aria-label="Previous photo">‹</a>{/if}
		{#if data.next}<a class="nav next" href="/photos/{data.next}" data-sveltekit-replacestate aria-label="Next photo">›</a>{/if}
	</div>

	<aside class="panel" aria-label="Photo details">
		<div class="p-top hide-phone">
			<span class="count">{data.position}</span>
			<a class="round close" href="/photos" aria-label="Close">✕</a>
		</div>
		<div class="caption">
			<div class="meta">Taken {data.when}</div>
			{#if data.entry?.title}<h1 class="title">{data.entry.title}</h1>{/if}
			{#if data.entry?.note}<p class="note">{data.entry.note}</p>{/if}
			{#if data.entry}<a class="link" href={data.entry.href}>View entry ›</a>{/if}
			<!-- Change date (#42): a details block, so it opens without JavaScript too -->
			<details class="change-date" bind:open={changingDate}>
				<summary class="btn-text">{changingDate ? 'Keep the date' : 'Change date'}</summary>
				<form method="POST" action="?/date" use:enhance class="date-form">
					<label class="sr-only" for="photo-date">Date taken</label>
					<input class="input" id="photo-date" type="date" name="date" value={data.taken.date} max={data.today} required />
					<label class="sr-only" for="photo-time">Time taken</label>
					<input class="input" id="photo-time" type="time" name="time" value={data.taken.time} required />
					<button class="btn btn-primary">Save date</button>
					{#if form?.dateError}<span class="error-text">✕ {form.dateError}</span>{/if}
				</form>
			</details>
			{#if data.pets.length}
				<div class="pets" role="group" aria-labelledby="pets-h">
					<span class="pets-h" id="pets-h">In this photo</span>
					<div class="chips">
						{#each data.pets as pet (pet.id)}
							<form method="POST" action="?/tag" use:enhance={keep}>
								<input type="hidden" name="livestockId" value={pet.id} />
								<input type="hidden" name="on" value={pet.tagged ? '0' : '1'} />
								<button class="chip" aria-pressed={pet.tagged} title={pet.species}>{pet.tagged ? '✓ ' : ''}{pet.name}</button>
							</form>
						{/each}
					</div>
				</div>
			{/if}
		</div>
		{#if data.subjects.length}
			<form method="POST" action="?/useFor" class="use-for" use:enhance>
				<label class="pets-h" for="use-for">Use as the photo for</label>
				{#if data.usedFor.length}<p class="used">✓ The photo for {data.usedFor.join(', ')}</p>{/if}
				<div class="use-row">
					<select class="input" id="use-for" name="for" required>
						<option value="">Choose…</option>
						{#each ['Plants', 'Livestock'] as g (g)}
							{@const list = data.subjects.filter((s) => s.group === g)}
							{#if list.length}<optgroup label={g}>{#each list as s (s.value)}<option value={s.value}>{s.label}</option>{/each}</optgroup>{/if}
						{/each}
					</select>
					<button class="btn">Use</button>
				</div>
			</form>
		{/if}
		<div class="tools" id="photo-tools">
			{@render shareCard('panel')}
			<div class="buttons">
				<a class="btn" href={download} download>Download</a>
				{@render cover('btn')}
			</div>
			<button type="button" class="btn-text delete" popovertarget="confirm-photo">Delete photo</button>
			<ConfirmDelete id="confirm-photo" trigger={false} title="Delete this photo?" body="The photo is removed from its entry. This can't be undone." />
		</div>
	</aside>
</div>

<Sheet bind:open={menu} label="Photo actions">
	<div class="menu">
		<a class="row" href={download} download onclick={() => (menu = false)}>Download</a>
		{@render cover('row')}
	</div>
	{@render shareCard('sheet')}
	<div class="sheet-foot">
		<button type="button" class="btn btn-danger" popovertarget="confirm-photo-sheet">Delete photo</button>
		<button type="button" class="btn" onclick={() => (menu = false)}>Cancel</button>
	</div>
	<ConfirmDelete id="confirm-photo-sheet" trigger={false} title="Delete this photo?" body="The photo is removed from its entry. This can't be undone." />
</Sheet>

<style>
	/* Fixed, so the dark stage fills the screen even where the shell centers a column (tablets). */
	.viewer {
		position: fixed;
		inset: 0;
		z-index: 10;
		overflow-y: auto;
		background: var(--viewer-bg);
		display: flex;
		flex-direction: column;
	}

	/* ── Phone (13b) ─────────────────────────────────────────── */
	.bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: calc(8px + env(safe-area-inset-top)) 20px 12px;
	}
	.round {
		width: 44px;
		height: 44px;
		border-radius: 0;
		flex-shrink: 0;
		background: var(--surface);
		color: var(--text-muted);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 18px;
		line-height: 1;
	}
	.more {
		font-size: 13px;
		letter-spacing: 0.05em;
	}
	/* on the stage, so it wears the overlay colors (readable in both themes) */
	.pos {
		font-size: 15px;
		font-weight: 600;
		padding: 5px 12px;
		border-radius: 0;
		background: var(--overlay-bg);
		color: var(--overlay-text);
		font-variant-numeric: tabular-nums;
	}
	.stage {
		flex: 1 1 0;
		min-height: 45dvh;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.stage img {
		display: block;
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		object-fit: contain;
	}
	.nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 44px;
		height: 44px;
		border-radius: 0;
		background: var(--surface);
		border: 1px solid var(--divider);
		color: var(--text-2);
		font-size: 20px;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.prev {
		left: 12px;
	}
	.next {
		right: 12px;
	}
	@media (hover: hover) {
		.round:hover,
		.nav:hover {
			background: var(--surface-hi);
			color: var(--text);
		}
	}

	/* The caption card at the bottom of the phone screen. */
	.panel {
		margin: 16px 16px calc(16px + env(safe-area-inset-bottom));
		align-self: center;
		width: calc(100% - 32px);
		max-width: 560px;
		border-radius: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
		padding: 16px;
		display: flex;
		flex-direction: column;
	}
	.caption {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.meta {
		font-size: 13px;
		color: var(--text-muted);
	}
	.title {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.note {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
		white-space: pre-line;
		overflow-wrap: anywhere;
		/* the whole note is on the entry: keep the photo in view */
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		overflow: hidden;
	}
	.link {
		align-self: flex-start;
		font-size: 14px;
		font-weight: 800;
		/* 44px tap target without adding height */
		padding: 12px 0;
		margin: -8px 0 -12px;
	}
	/* Change date (#42) */
	.change-date {
		margin-top: 4px;
	}
	.change-date summary {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-size: 14px;
		font-weight: 800;
		color: var(--accent-text);
		cursor: pointer;
		list-style: none;
	}
	.change-date summary::-webkit-details-marker {
		display: none;
	}
	.date-form {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 8px;
		padding-bottom: 8px;
	}
	.date-form .input {
		min-height: 44px;
		min-width: 0;
	}
	.date-form .btn,
	.date-form .error-text {
		grid-column: 1 / -1;
	}
	.pets {
		margin-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.pets-h {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.pets .chips form {
		display: contents;
	}
	/* this photo as a plant's or an animal's own */
	.use-for {
		margin-top: 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.used {
		margin: 0;
		font-size: 13px;
		color: var(--ok);
	}
	.use-row {
		display: flex;
		gap: 8px;
	}
	.use-row select {
		flex: 1;
		min-width: 0;
		height: 44px;
	}
	.use-row .btn {
		height: 44px;
	}
	/* Actions live in the ••• sheet; without JavaScript the ••• link shows them here. */
	.tools {
		display: none;
		flex-direction: column;
		gap: 12px;
	}
	.tools:target {
		display: flex;
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}
	.buttons {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	.buttons .btn {
		width: 100%;
	}
	.is-cover {
		color: var(--text-muted);
		cursor: default;
	}
	.delete {
		align-self: center;
		color: var(--bad);
		font-size: 14px;
	}
	@media (hover: hover) {
		.delete:hover {
			color: var(--bad);
			text-decoration: underline;
		}
	}

	/* Public link card */
	.share {
		border-radius: 0;
		background: var(--surface);
		border: 1px solid var(--divider);
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.share.on {
		border-color: var(--accent);
	}
	.s-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		min-height: 32px;
	}
	.s-title {
		font-size: 15px;
		font-weight: 800;
	}
	.switch {
		border-radius: 0;
	}
	.switch::before {
		content: '';
		position: absolute;
		inset: -6px -4px;
	}
	.switch[aria-checked='true'] span {
		background: var(--accent);
	}
	.switch[aria-checked='true'] span::after {
		transform: translateX(20px);
	}
	.s-row {
		display: flex;
		gap: 8px;
	}
	.s-url {
		flex: 1;
		min-width: 0;
		height: 44px;
		border-radius: 0;
		background: var(--bg);
		border: 1px solid var(--divider);
		padding: 0 10px;
		font-size: 13px;
		color: var(--text-2);
		text-overflow: ellipsis;
	}
	.s-url:focus {
		outline: none;
		border-color: var(--accent);
	}
	.s-copy {
		padding: 0 14px;
		font-size: 14px;
		border-radius: 0;
	}
	.s-opts {
		display: flex;
		flex-direction: column;
	}
	.s-save {
		align-self: flex-start;
		margin-top: 4px;
	}
	.s-note {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-muted);
	}

	/* ── Sheet (phone ••• menu) ──────────────────────────────── */
	.menu {
		border: 1px solid var(--border);
		border-radius: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.menu > * + * {
		border-top: 1px solid var(--border);
	}
	.row {
		width: 100%;
		min-height: 52px;
		padding: 0 16px;
		display: flex;
		align-items: center;
		font-size: 16px;
		font-weight: 700;
		color: var(--text);
		text-align: left;
	}
	.row.is-cover {
		color: var(--text-muted);
	}
	@media (hover: hover) {
		button.row:hover,
		a.row:hover {
			background: var(--surface-hi);
			color: var(--text);
		}
	}
	.sheet-foot {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.sheet-foot .btn {
		min-height: 48px;
	}
	/* in the sheet the card sits on a surface: recess it */
	.menu + .share {
		background: var(--bg);
	}

	/* ── Desktop (D8): stage + docked panel ─────────────────── */
	@media (min-width: 1024px) {
		.viewer {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 340px;
			grid-template-rows: minmax(0, 1fr);
			overflow: hidden;
		}
		.stage {
			min-height: 0;
			padding: 48px;
		}
		.nav {
			width: 48px;
			height: 48px;
		}
		.prev {
			left: 20px;
		}
		.next {
			right: 20px;
		}
		.panel {
			margin: 0;
			width: auto;
			max-width: none;
			align-self: stretch;
			min-height: 0;
			overflow-y: auto;
			border-radius: 0;
			border: none;
			border-left: 2px solid var(--divider);
			background: var(--bg);
			padding: 24px;
			gap: 14px;
		}
		.p-top {
			display: flex;
			justify-content: space-between;
			align-items: center;
		}
		.count {
			font-size: 14px;
			color: var(--text-muted);
			font-variant-numeric: tabular-nums;
		}
		.close {
			width: 40px;
			height: 40px;
			font-size: 16px;
			position: relative;
		}
		.caption {
			gap: 14px;
		}
		.title {
			font-size: 20px;
		}
		.meta {
			font-size: 11px;
			letter-spacing: 0.08em;
			text-transform: uppercase;
		}
		.note {
			font-size: 15px;
			display: block;
			overflow: visible;
		}
		.link {
			font-size: 15px;
			margin: -12px 0;
		}
		/* the card and buttons sit at the bottom of the panel */
		.tools,
		.tools:target {
			display: flex;
			margin-top: auto;
			padding-top: 10px;
			border-top: none;
		}
		.share {
			gap: 10px;
		}
		.s-url {
			height: 38px;
			font-size: 12px;
			border-radius: 0;
		}
		.s-copy {
			min-height: 38px;
			padding: 0 12px;
			font-size: 13px;
			border-radius: 0;
		}
		.s-opts {
			gap: 6px;
		}
		.s-opts .check-row {
			min-height: 22px;
			gap: 8px;
			font-size: 13px;
		}
		.s-opts .check-row input {
			width: 18px;
			height: 18px;
			border-radius: 0;
			border-width: 1.5px;
		}
		.s-opts .check-row input:checked::after {
			font-size: 12px;
		}
		.s-note {
			font-size: 12px;
		}
		.buttons .btn {
			min-height: 42px;
			border-radius: 0;
			font-size: 14px;
		}
		.delete {
			min-height: 32px;
			margin: -4px 0 -6px;
			font-size: 13px;
		}
	}
</style>
