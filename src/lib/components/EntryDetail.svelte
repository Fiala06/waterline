<script lang="ts">
	// One entry on its own page (phones, and desktop links straight to an
	// entry): the title and when, then the readings under a 2px ink rule with
	// 1px dividers, the note, the photos, and Edit / Delete.
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

	// "‹ History", "‹ Overview": the back link names where it goes.
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
		if (path === '/') return { href, label: 'Overview' };
		const tankId = path.match(/^\/tanks\/([^/]+)/)?.[1];
		const tanks = (page.data.tanks ?? []) as { id: string; name: string }[];
		const tankName = tankId && tanks.find((t) => t.id === tankId)?.name;
		return { href, label: tankName || PLACES[path.split('/')[1]] || 'Back' };
	});
</script>

<div class="wrap">
	<a class="back hide-desk" href={back.href}>‹ {back.label}</a>
	<div class="head">
		<h1>{title}</h1>
		<div class="when">{when}{edited ? ` · edited ${edited}` : ''}</div>
	</div>
	{#if rows.length}
		<div class="rows">
			{#each rows as r, i (i)}
				<div class="row" class:bad={r.level === 'bad'}>
					<span class="label">{r.label}</span>
					<span class="value num">{r.value}</span>
					{#if r.statusText}<span class="st status-{r.level}">{r.statusText}</span>{/if}
				</div>
			{/each}
		</div>
	{/if}
	{#if note}
		<div class="note">
			<span class="kicker">Note</span>
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

<style>
	.wrap {
		max-width: 560px;
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
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
	}
	.when {
		font-size: 14px;
		color: var(--text-muted);
	}
	.rows {
		border-top: 2px solid var(--ink);
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto 104px;
		gap: 12px;
		align-items: baseline;
		padding: 10px 8px;
		border-bottom: 1px solid var(--divider);
		font-size: 15px;
	}
	.row.bad {
		background: var(--surface);
	}
	.label {
		min-width: 0;
		color: var(--text-2);
	}
	.row.bad .label {
		color: var(--bad);
	}
	.value {
		font-size: 16px;
		font-weight: 800;
		white-space: nowrap;
	}
	.st {
		text-align: right;
		font-size: 12px;
		font-weight: 800;
	}
	.note {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.note p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
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
		display: block;
	}
	.actions {
		display: flex;
		gap: 10px;
		padding-top: 6px;
	}
	/* Only the row's own buttons: the confirm dialog inside keeps its 44px buttons (7.10). */
	.actions > .edit,
	.actions > :global(.copy),
	.actions > :global(.btn-danger) {
		flex: 1;
		height: 50px;
		font-size: 15px;
	}
	@media (min-width: 1024px) {
		/* the shell's sub-head already says "Water test": the entry sits under it */
		.wrap {
			max-width: 640px;
			padding: 20px 32px 32px;
		}
		.actions > .edit,
		.actions > :global(.btn-danger) {
			height: 44px;
			font-size: 14px;
		}
	}
</style>
