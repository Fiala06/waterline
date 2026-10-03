<script lang="ts">
	// 13 (phone) / D7 (desktop). On desktop the shell header carries the title
	// and tank switcher, so only the Upload control stays here.
	import { enhance } from '$app/forms';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { photoUrl } from '$lib/media';
	import { ui } from '$lib/ui.svelte';
	let { data, form } = $props();
	let uploadForm: HTMLFormElement | undefined = $state();
	const total = $derived(data.months.reduce((n, m) => n + m.photos.length, 0));
</script>

<svelte:head><title>Photos · Waterline</title></svelte:head>

<div class="page">
	<a class="back hide-desk" href="/">‹ Dashboard</a>
	<div class="head">
		<h1 class="hide-desk">Photos</h1>
		{#if data.tank}
			<button type="button" class="tank hide-desk" onclick={() => (ui.tankSwitcher = true)}>{data.tank.name} ▾</button>
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
		<EmptyState
			icon="note"
			title="No photos yet"
			text="Photos you add to entries appear here."
			href={data.tank ? '/entries/event/new?category=note' : undefined}
			label="Add photo"
		/>
	{/if}

	{#each data.months as m (m.key)}
		<section>
			<h2>{m.label}<span class="count">{` · ${m.photos.length}`}</span></h2>
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
	/* 13: same header rhythm as History and Charts (11, 12); the links and
	   Upload keep 44px tap areas without pushing the title down */
	.page {
		padding: 0 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.back {
		margin-top: -7px;
		margin-bottom: -24px;
	}
	.head {
		display: flex;
		align-items: baseline;
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
		margin-block: -10px;
	}
	.head form {
		margin-block: -10px;
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
		font-size: 14px;
		font-weight: 400;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 4px;
	}
	.tile {
		position: relative;
		aspect-ratio: 1;
		border-radius: 0;
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
		font-size: 12px;
		font-weight: 700;
		line-height: 1.4;
		padding: 1px 6px;
		border-radius: 0;
		background: var(--overlay-bg);
		color: var(--overlay-text);
		white-space: nowrap;
	}
	@media (min-width: 1024px) {
		.page {
			padding: 20px 32px 32px;
			gap: 20px;
		}
		/* D7's Upload: a slim toolbar row (the header has the title and tank) */
		.head {
			justify-content: flex-end;
			margin-bottom: -8px;
		}
		.head form {
			margin-block: 0;
		}
		.upload {
			min-height: 40px;
		}
		section {
			gap: 10px;
		}
		h2 {
			font-size: 16px;
		}
		.count {
			display: inline;
		}
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
			gap: 8px;
		}
		.tile {
			border-radius: 0;
		}
		.day {
			left: 8px;
			bottom: 8px;
			padding: 1px 7px;
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
