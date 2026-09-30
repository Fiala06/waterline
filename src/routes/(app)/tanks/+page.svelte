<script lang="ts">
	import { tankTypeLabel } from '$lib/types';
	import { enhance } from '$app/forms';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import TankThumb from '$lib/components/TankThumb.svelte';
	import { photoUrl } from '$lib/media';
	let { data } = $props();
	const spec = (t: { type: string; volume: string | null }) => [tankTypeLabel(t.type), t.volume].filter(Boolean).join(' · ');
</script>

<svelte:head><title>Tanks · Waterline</title></svelte:head>

<div class="page">
	<!-- the desktop header has the title and "Add tank" -->
	<div class="head hide-desk">
		<h1>Tanks</h1>
		<a class="btn" href="/tanks/new">Add tank</a>
	</div>

	{#if data.tankCards.length}
		<div class="grid">
			{#each data.tankCards as t (t.id)}
				<a class="tank" href="/tanks/{t.id}">
					<div class="cover" class:photo-placeholder={!t.cover}>
						{#if t.cover}<img src={photoUrl(t.cover, 'full')} alt="" loading="lazy" style:object-position={t.coverPos} />{/if}
					</div>
					<div class="info">
						<div class="row">
							<h2>{t.name}</h2>
							<span class="spec">{spec(t)}</span>
						</div>
						<div class="tags">
							<span class="status-tag tag-{t.status.level}">{t.status.text}</span>
							{#if t.task}<span class="status-tag tag-{t.task.level}">{t.task.text}</span>{/if}
						</div>
						<p class="meta hide-phone">{t.meta}</p>
					</div>
				</a>
			{/each}
			<a class="add-tile hide-phone" href="/tanks/new">
				<span class="plus" aria-hidden="true">+</span>
				<span class="add-title">Add tank</span>
				<span class="add-text">Freshwater, planted, brackish or reef</span>
			</a>
		</div>
	{:else}
		<EmptyState icon="tank" title="No tanks yet" text="Add your first tank to start logging." href="/tanks/new" label="Add tank" primary />
	{/if}

	{#if data.archived.length}
		<details class="archived">
			<summary>
				<span>Archived · {data.archived.length}<span class="hide-desk">{data.archived.length === 1 ? ' tank' : ' tanks'}</span></span>
				<span class="chev" aria-hidden="true">▸</span>
			</summary>
			<ul>
				{#each data.archived as t (t.id)}
					<li>
						<span class="a-thumb"><TankThumb cover={t.cover} size={40} radius={8} /></span>
						<div class="a-text">
							<span class="a-name">{t.name}</span>
							<span class="a-meta"
								>{spec(t)}{#if t.archivedOn}{' · '}<span class="nowrap">archived {t.archivedOn}</span>{/if}</span
							>
						</div>
						<form method="POST" action="?/restore" use:enhance>
							<input type="hidden" name="tankId" value={t.id} />
							<button class="btn-text">Restore</button>
						</form>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 8px 0 2px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	.grid {
		display: grid;
		gap: 14px;
	}
	/* The whole card opens the tank. */
	.tank {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border-radius: 18px;
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
	}
	.tank:hover {
		color: var(--text);
		border-color: var(--border-strong);
	}
	.cover {
		height: 120px;
		flex-shrink: 0;
		border: none;
		border-bottom: 1px solid var(--border);
		overflow: hidden;
	}
	.cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.info {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}
	h2 {
		margin: 0;
		min-width: 0;
		font-size: 18px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.spec {
		flex-shrink: 0;
		font-size: 13px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.meta {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
	}
	.add-tile {
		min-height: 300px;
		border-radius: 18px;
		border: 1px dashed var(--border-strong);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 20px;
		text-align: center;
		color: var(--text);
	}
	.add-tile:hover {
		color: var(--text);
		background: var(--surface);
	}
	.plus {
		font-size: 30px;
		line-height: 1;
		color: var(--accent);
	}
	.add-title {
		font-size: 16px;
		font-weight: 600;
	}
	.add-text {
		font-size: 13px;
		color: var(--text-muted);
	}

	/* Archived: one collapsible card (09 phone row, D3 desktop list) */
	.archived {
		border-radius: 14px;
		border: 1px solid var(--border);
	}
	.archived summary {
		list-style: none;
		min-height: 52px;
		padding: 0 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 15px;
		color: var(--text-muted);
		cursor: pointer;
		border-radius: 14px;
	}
	.archived summary::-webkit-details-marker {
		display: none;
	}
	.chev {
		font-size: 13px;
		color: var(--text-muted);
		transition: transform 0.15s;
	}
	.archived[open] .chev {
		transform: rotate(90deg);
	}
	.archived[open] summary {
		border-bottom: 1px solid var(--border);
		border-radius: 14px 14px 0 0;
	}
	.archived ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.archived li {
		min-height: 60px;
		padding: 8px 8px 8px 16px;
		display: flex;
		align-items: center;
		gap: 14px;
		font-size: 15px;
	}
	.archived li + li {
		border-top: 1px solid var(--divider-soft);
	}
	.a-thumb {
		opacity: 0.6;
	}
	.a-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.a-name {
		font-weight: 600;
		color: var(--text-2);
	}
	.a-meta {
		font-size: 13px;
		color: var(--text-muted);
	}
	.nowrap {
		white-space: nowrap;
	}

	@media (hover: hover) {
		.archived summary:hover {
			color: var(--text);
		}
	}
	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
			gap: 22px;
		}
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
			gap: 18px;
		}
		.cover {
			height: 180px;
		}
		.info {
			padding: 16px;
			gap: 12px;
		}
		h2 {
			font-size: 20px;
		}
		.archived summary {
			font-weight: 600;
			color: var(--text);
		}
	}
</style>
