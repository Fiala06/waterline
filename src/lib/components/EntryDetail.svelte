<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { photoUrl } from '$lib/media';
	import { ui } from '$lib/ui.svelte';
	interface Row {
		label: string;
		value: string;
		statusText?: string;
		level?: string;
	}
	let {
		title,
		when,
		edited = null,
		rows = [],
		note = null,
		photos = [],
		backHref,
		editHref,
		actions
	}: {
		title: string;
		when: string;
		edited?: string | null;
		rows?: Row[];
		note?: string | null;
		photos?: { id: string }[];
		backHref: string;
		editHref: string;
		actions: Snippet;
	} = $props();

	// "‹ History", "‹ Dashboard": the back link names where it goes.
	const PLACES: Record<string, string> = {
		history: 'History',
		charts: 'Charts',
		photos: 'Photos',
		tasks: 'Tasks',
		tanks: 'Tanks',
		settings: 'Settings'
	};
	const back = $derived.by(() => {
		const href = ui.prev ?? backHref;
		const path = href.split(/[?#]/)[0];
		if (path === '/') return { href, label: 'Dashboard' };
		const tankId = path.match(/^\/tanks\/([^/]+)/)?.[1];
		const tanks = (page.data.tanks ?? []) as { id: string; name: string }[];
		const tankName = tankId && tanks.find((t) => t.id === tankId)?.name;
		return { href, label: tankName || PLACES[path.split('/')[1]] || 'Back' };
	});
</script>

<div class="wrap">
	<a class="back hide-desk" href={back.href}>‹ {back.label}</a>
	<div class="card sheet">
		<div class="head">
			<h1>{title}</h1>
			<div class="when">{when}{edited ? ` · edited ${edited}` : ''}</div>
		</div>
		{#if rows.length}
			<div class="rows">
				{#each rows as r, i (i)}
					<div class="row">
						<span class="label">{r.label}</span>
						<span class="value num">{r.value}</span>
						{#if r.statusText}<span class="st status-{r.level}">{r.statusText}</span>{/if}
					</div>
				{/each}
			</div>
		{/if}
		{#if note}
			<div class="note">
				<div class="note-label">Note</div>
				<p>{note}</p>
			</div>
		{/if}
		{#if photos.length}
			<div class="photos">
				{#each photos as p (p.id)}
					<a href="/photos/{p.id}"><img src={photoUrl(p.id)} alt="From this entry" loading="lazy" /></a>
				{/each}
			</div>
		{/if}
		<div class="actions">
			{#if editHref}<a class="btn edit" href={editHref}>Edit</a>{/if}
			{@render actions()}
		</div>
	</div>
</div>

<style>
	.wrap {
		max-width: 560px;
		margin-inline: auto;
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.sheet {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	h1 {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
	}
	.when {
		font-size: 14px;
		color: var(--text-muted);
	}
	.rows {
		border-radius: 16px;
		background: var(--surface-2);
		border: 1px solid var(--border);
	}
	.row {
		padding: 12px 14px;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.row + .row {
		border-top: 1px solid var(--border);
	}
	.label {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		color: var(--text-muted);
	}
	.value {
		font-size: 17px;
		font-weight: 600;
	}
	.st {
		min-width: 96px;
		max-width: 50%;
		text-align: right;
		font-size: 13px;
		font-weight: 600;
	}
	.note-label {
		font-size: 13px;
		color: var(--text-muted);
	}
	.note p {
		margin: 6px 0 0;
		font-size: 15px;
		line-height: 1.5;
		white-space: pre-wrap;
	}
	.photos {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
	}
	.photos img {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 10px;
		display: block;
	}
	.actions {
		display: flex;
		gap: 10px;
	}
	/* Only the row's own buttons: the confirm dialog inside keeps its 44px buttons (7.10). */
	.actions > .edit,
	.actions > :global(.btn-danger) {
		flex: 1;
		height: 50px;
		font-size: 16px;
	}
	@media (min-width: 1024px) {
		/* the header already says "History › Water test"; the card sits centered (D6) */
		.wrap {
			max-width: 640px;
			padding: 28px 32px;
		}
		.sheet {
			padding: 24px;
		}
		.actions > .edit,
		.actions > :global(.btn-danger) {
			height: 44px;
			font-size: 15px;
		}
	}
</style>
