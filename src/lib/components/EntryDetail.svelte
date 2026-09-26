<script lang="ts">
	import type { Snippet } from 'svelte';
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
</script>

<div class="wrap">
	<a class="back" href={ui.prev ?? backHref}>‹ Back</a>
	<div class="card sheet">
		<div class="head">
			<h1>{title}</h1>
			<div class="muted">{when}{edited ? ` · edited ${edited}` : ''}</div>
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
				<div class="muted sm">Note</div>
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
		font-size: 15px;
		color: var(--text-muted);
	}
	.value {
		font-size: 17px;
		font-weight: 600;
	}
	.st {
		min-width: 100px;
		max-width: 50%;
		text-align: right;
		font-size: 13px;
		font-weight: 600;
	}
	.note p {
		margin: 6px 0 0;
		font-size: 15px;
		line-height: 1.5;
		white-space: pre-wrap;
	}
	.sm {
		font-size: 13px;
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
	.edit {
		flex: 1;
		height: 50px;
		font-size: 16px;
	}
	.actions :global(.btn-danger) {
		height: 50px;
		font-size: 16px;
	}
	@media (min-width: 1024px) {
		.wrap {
			padding: 28px 32px;
		}
	}
</style>
