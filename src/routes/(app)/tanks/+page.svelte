<script lang="ts">
	import { tankTypeLabel } from '$lib/types';
	import { enhance } from '$app/forms';
	import { photoUrl } from '$lib/media';
	let { data } = $props();
</script>

<svelte:head><title>Tanks · Waterline</title></svelte:head>

<div class="page">
	<div class="head">
		<h1>Tanks</h1>
		<a class="btn" href="/tanks/new">Add tank</a>
	</div>

	{#if !data.tankCards.length}
		<div class="card empty">
			<strong>No tanks yet</strong>
			<span class="muted">Add your first tank to start logging.</span>
			<a class="btn btn-primary" href="/tanks/new">Add tank</a>
		</div>
	{/if}

	<div class="grid">
		{#each data.tankCards as t (t.id)}
			<article class="card tank">
				<a class="cover" class:photo-placeholder={!t.cover} href="/?tank={t.id}" aria-label="Open {t.name} dashboard">
					{#if t.cover}<img src={photoUrl(t.cover, 'full')} alt="" loading="lazy" />{/if}
				</a>
				<div class="info">
					<div class="row">
						<div>
							<h2><a href="/tanks/{t.id}">{t.name}</a></h2>
							<div class="muted sub">{tankTypeLabel(t.type)}{t.volume ? ` · ${t.volume}` : ''}</div>
						</div>
						<a class="btn edit" href="/tanks/{t.id}">Details</a>
					</div>
					<div class="statuses">
						<span class="st status-{t.status.level}">{t.status.text}</span>
						{#if t.task}<span class="st status-{t.task.level}">{t.task.text}</span>{/if}
					</div>
					<div class="meta">{t.meta}</div>
				</div>
			</article>
		{/each}
	</div>

	{#if data.archived.length}
		<details class="archived">
			<summary>Archived · {data.archived.length} tank{data.archived.length === 1 ? '' : 's'}</summary>
			<ul>
				{#each data.archived as t (t.id)}
					<li class="card arow">
						<div>
							<div class="aname">{t.name}</div>
							<div class="muted sub">
								{tankTypeLabel(t.type)}{t.volume ? ` · ${t.volume}` : ''} · archived {t.archivedOn}
							</div>
						</div>
						<form method="POST" action="?/restore" use:enhance>
							<input type="hidden" name="tankId" value={t.id} />
							<button class="btn">Restore</button>
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
		gap: 16px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 8px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	.head .btn {
		min-height: 40px;
	}
	.grid {
		display: grid;
		gap: 14px;
	}
	.tank {
		overflow: hidden;
	}
	.cover {
		display: block;
		height: 120px;
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
		align-items: flex-start;
		gap: 12px;
	}
	h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
	}
	h2 a {
		color: var(--text);
	}
	.sub {
		font-size: 13px;
		margin-top: 2px;
	}
	.edit {
		min-height: 40px;
		font-weight: 400;
	}
	.statuses {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
	}
	.st {
		font-size: 14px;
		font-weight: 600;
	}
	.meta {
		font-size: 13px;
		color: var(--text-faint);
	}
	.empty {
		padding: 20px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}
	.archived summary {
		cursor: pointer;
		font-size: 15px;
		color: var(--text-muted);
		padding: 10px 0;
		min-height: 44px;
	}
	.archived ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.arow {
		padding: 12px 14px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.aname {
		font-weight: 600;
	}
	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
		}
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		}
	}
</style>
