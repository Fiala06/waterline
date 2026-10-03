<script lang="ts">
	// Photos (README → Screens §5): a month-grouped grid under 2px ink rules,
	// with Upload in the toolbar. The shell carries the tank name and tabs.
	import { enhance } from '$app/forms';
	import { photoUrl } from '$lib/media';
	let { data, form } = $props();
	let uploadForm: HTMLFormElement | undefined = $state();
	const total = $derived(data.months.reduce((n, m) => n + m.photos.length, 0));
</script>

<svelte:head><title>Photos · Waterline</title></svelte:head>

<div class="page">
	<div class="toolbar">
		<span class="count">{total} photo{total === 1 ? '' : 's'} · from notes, tests and uploads</span>
		{#if data.tank}
			<form bind:this={uploadForm} method="POST" action="?/upload" enctype="multipart/form-data" use:enhance>
				<input type="hidden" name="tankId" value={data.tank.id} />
				<label class="btn upload">
					Upload
					<input type="file" name="photos" accept="image/*" multiple onchange={() => uploadForm?.requestSubmit()} />
				</label>
				<noscript><button class="btn">Save photos</button></noscript>
			</form>
		{/if}
	</div>
	{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}

	{#if !total}
		<div class="empty">
			<p>No photos yet. Photos you add to notes and tests show up here.</p>
			{#if data.tank}<a class="btn" href="/entries/event/new?category=note&tank={data.tank.id}">Add photo</a>{/if}
		</div>
	{/if}

	{#each data.months as m (m.key)}
		<section>
			<h2><span>{m.label}</span><span class="n">{m.photos.length}</span></h2>
			<div class="grid">
				{#each m.photos as p (p.id)}
					<a class="tile" href="/photos/{p.id}">
						<img src={photoUrl(p.id)} alt="Photo from {p.day}" loading="lazy" />
						<span class="day" aria-hidden="true">{p.day}</span>
					</a>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.page {
		padding: 12px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.count {
		font-size: 13px;
		color: var(--text-muted);
	}
	.upload {
		position: relative;
		cursor: pointer;
	}
	.upload input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.upload:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.empty {
		border-top: 2px solid var(--ink);
		padding: 24px 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 14px;
	}
	.empty p {
		margin: 0;
		font-size: 14px;
		color: var(--text-2);
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h2 {
		margin: 0;
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		font-size: 16px;
	}
	.n {
		font-size: 13px;
		font-weight: 400;
		color: var(--text-muted);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 4px;
	}
	.tile {
		position: relative;
		aspect-ratio: 1;
		overflow: hidden;
		background: var(--surface);
	}
	.tile img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.day {
		position: absolute;
		left: 6px;
		bottom: 6px;
		padding: 1px 7px;
		background: var(--ink);
		color: var(--bg);
		font-size: 12px;
		font-weight: 800;
		line-height: 1.4;
		white-space: nowrap;
	}
	@media (min-width: 1024px) {
		.page {
			padding: 20px 32px 48px;
			gap: 28px;
		}
		section {
			gap: 12px;
		}
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
			gap: 8px;
		}
		.day {
			left: 8px;
			bottom: 8px;
		}
		@media (hover: hover) {
			.tile img {
				transition: opacity 0.15s;
			}
			.tile:hover img {
				opacity: 0.85;
			}
		}
	}
</style>
