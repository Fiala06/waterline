<script lang="ts">
	// Tanks (redesign README → Screens §1): a grid of cards, each with a 2px ink
	// top rule, a 180px cover, the name at 22/800 with the spec kicker, a status
	// tag and a next-task tag, then a meta line; a dashed Add tank tile; then
	// Archived, with Restore. The desktop title and "+ Add tank" are the shell's.
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
		<div class="ph-text">
			<span class="kicker">{data.tankCards.length} active{data.archived.length ? ` · ${data.archived.length} archived` : ''}</span>
			<h1>Tanks</h1>
		</div>
		<a class="btn btn-primary" href="/tanks/new">+ Add tank</a>
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
							<span class="kicker spec">{spec(t)}</span>
						</div>
						<div class="tags">
							<span class="tag {t.status.level === 'bad' ? 'tag-accent' : 'tag-neutral'} status-tag tag-{t.status.level}">{t.status.text}</span>
							{#if t.task}<span class="tag tag-neutral status-tag tag-{t.task.level}">{t.task.text}</span>{/if}
						</div>
						<p class="meta">{t.meta}</p>
					</div>
				</a>
			{/each}
			<a class="add-tile" href="/tanks/new">
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
						<span class="a-thumb"><TankThumb cover={t.cover} size={40} /></span>
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
		gap: 24px;
	}
	/* the phone head: kicker, title and the action, over a 2px rule */
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 12px;
		padding: 12px 0 14px;
		border-bottom: 2px solid var(--divider);
	}
	.ph-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	h1 {
		margin: 0;
		font-size: 28px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 24px;
	}
	/* The whole card opens the tank: a 2px ink rule, the cover, then the text. */
	.tank {
		display: flex;
		flex-direction: column;
		border-top: 2px solid var(--ink);
		color: var(--text);
	}
	@media (hover: hover) {
		.tank:hover {
			color: var(--text);
			background: var(--surface);
		}
	}
	.cover {
		height: 180px;
		flex-shrink: 0;
		overflow: hidden;
	}
	.cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.info {
		padding: 14px 12px 16px;
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
		font-size: 22px;
		font-weight: 800;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.spec {
		flex-shrink: 0;
		white-space: nowrap;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	/* the design's tags: 11px, a touch bolder */
	.tags .tag {
		height: auto;
		padding: 3px 10px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.02em;
	}
	.tags .tag-bad {
		background: var(--accent-100);
		color: var(--accent-800);
		font-weight: 700;
	}
	.tags .tag-warn,
	.tags .tag-ok,
	.tags .tag-none {
		background: var(--surface);
		color: var(--text);
	}
	.tags .tag-warn {
		font-weight: 700;
	}
	.tags .tag-none {
		color: var(--text-muted);
	}
	.meta {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	.add-tile {
		min-height: 300px;
		border: 2px dashed var(--divider);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 20px;
		text-align: center;
		color: var(--text);
	}
	@media (hover: hover) {
		.add-tile:hover {
			color: var(--text);
			border-color: var(--accent);
		}
	}
	.plus {
		font-size: 32px;
		line-height: 1;
		color: var(--accent-text);
	}
	.add-title {
		font-size: 16px;
		font-weight: 800;
	}
	.add-text {
		font-size: 13px;
		color: var(--text-muted);
	}

	/* Archived: a 2px rule, the toggle row, then rows with 1px dividers */
	.archived {
		border-top: 2px solid var(--divider);
	}
	.archived summary {
		list-style: none;
		min-height: 52px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
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
	.archived ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.archived li {
		min-height: 60px;
		padding: 10px 0;
		display: flex;
		align-items: center;
		gap: 14px;
		font-size: 15px;
		border-top: 1px solid var(--divider);
	}
	.a-thumb {
		opacity: 0.6;
	}
	.a-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.a-name {
		font-weight: 600;
	}
	.a-meta {
		font-size: 13px;
		color: var(--text-muted);
	}
	.nowrap {
		white-space: nowrap;
	}
	/* phones: the card's tags may be narrower; the add tile is shorter */
	@media (max-width: 1023px) {
		.add-tile {
			min-height: 140px;
		}
	}
	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px 48px;
		}
	}
</style>
