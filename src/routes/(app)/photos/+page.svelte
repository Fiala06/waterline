<script lang="ts">
	import { enhance } from '$app/forms';
	import { photoUrl } from '$lib/media';
	import { ui } from '$lib/ui.svelte';
	let { data, form } = $props();
	let uploadForm: HTMLFormElement | undefined = $state();
	const total = $derived(data.months.reduce((n, m) => n + m.photos.length, 0));
</script>

<svelte:head><title>Photos · Waterline</title></svelte:head>

<div class="page">
	<a class="back" href="/">‹ Dashboard</a>
	<div class="head">
		<h1>Photos</h1>
		{#if data.tank}
			<button type="button" class="tank" onclick={() => (ui.tankSwitcher = true)}>{data.tank.name} ▾</button>
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
		<div class="card empty">
			<strong>No photos yet</strong>
			<span class="muted">Photos you add to entries appear here.</span>
		</div>
	{/if}

	{#each data.months as m (m.key)}
		<section>
			<h2>{m.label} <span class="count">· {m.photos.length}</span></h2>
			<div class="grid">
				{#each m.photos as p (p.id)}
					<a class="tile" href="/photos/{p.id}">
						<img src={photoUrl(p.id)} alt="{p.day}" loading="lazy" />
						<span class="day">{p.day}</span>
					</a>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
		flex: 1;
	}
	.tank {
		font-size: 14px;
		color: var(--text-muted);
		min-height: 44px;
	}
	.upload {
		position: relative;
		min-height: 40px;
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
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}
	.count {
		display: none;
		color: var(--text-muted);
		font-weight: 400;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
	}
	.tile {
		position: relative;
		aspect-ratio: 1;
		border-radius: 6px;
		overflow: hidden;
		background: var(--surface-hi);
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
		font-size: 11px;
		font-weight: 600;
		color: #e6f0f0;
		background: rgba(12, 26, 31, 0.85);
		padding: 2px 6px;
		border-radius: 4px;
	}
	.empty {
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
		}
		.back,
		.tank {
			display: none;
		}
		.count {
			display: inline;
		}
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
			gap: 10px;
		}
		.tile {
			border-radius: 10px;
		}
	}
</style>
