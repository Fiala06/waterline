<script lang="ts">
	// Photos (README → Screens §5): a month-grouped grid under 2px ink rules,
	// with Upload in the toolbar. The shell carries the tank name and tabs.
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import DateField from '$lib/components/DateField.svelte';
	import { exifHint, exifToWhen, readFileExifDate, type ExifDate } from '$lib/exif';
	import { photoUrl } from '$lib/media';
	let { data, form } = $props();
	const total = $derived(data.months.reduce((n, m) => n + m.photos.length, 0));

	// The upload (#42): choosing photos reads the date each was taken and sets Taken from it;
	// photos from several days each keep their own. Without JavaScript the field defaults to today.
	let js = $state(false);
	onMount(() => (js = true));
	let picked = $state(0);
	let dates = $state<(ExifDate | null)[]>([]);
	let taken = $state(untrack(() => data.today));
	let busy = $state(false);
	const days = $derived(new Set(dates.filter((d): d is ExifDate => !!d).map((d) => exifToWhen(d, data.user.timeZone).date)));
	async function onchange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = [...(input.files ?? [])];
		picked = files.length;
		dates = await Promise.all(files.map(readFileExifDate));
		const first = dates.find((d) => d);
		taken = first ? exifToWhen(first, data.user.timeZone).date : data.today;
		if (taken > data.today) taken = data.today;
	}
</script>

<svelte:head><title>Photos · Waterline</title></svelte:head>

<div class="page">
	<div class="toolbar">
		<span class="count">{total} photo{total === 1 ? '' : 's'} · from notes, tests and uploads</span>
		{#if data.tank}
			<form
				method="POST"
				action="?/upload"
				enctype="multipart/form-data"
				class="upload-form"
				class:picked={picked > 0 || !js}
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						busy = false;
						picked = 0;
						dates = [];
						await update();
					};
				}}
			>
				<input type="hidden" name="tankId" value={data.tank.id} />
				<label class="btn upload" class:btn-primary={!picked && js}>
					{picked ? `${picked} photo${picked === 1 ? '' : 's'} chosen` : 'Upload'}
					<input type="file" name="photos" accept="image/*" multiple {onchange} />
				</label>
				{#each dates as d, i (i)}<input type="hidden" name="photoTaken" value={d ? exifHint(d) : ''} />{/each}
				<div class="taken">
					<label class="label" for="taken">Taken</label>
					<DateField name="taken" id="taken" bind:value={taken} today={data.today} max={data.today} required label="Taken" />
					{#if days.size > 1}<span class="hint">From {days.size} days · each photo keeps its own</span>{/if}
					<button class="btn btn-primary" disabled={busy}>{busy ? 'Adding…' : picked ? `Add ${picked} photo${picked === 1 ? '' : 's'}` : 'Save photos'}</button>
				</div>
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
	.upload-form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
	}
	/* the Taken date and Add show once photos are chosen (always without JavaScript) */
	.taken {
		display: none;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.upload-form.picked .taken {
		display: flex;
	}
	.taken .label {
		font-size: 13px;
		color: var(--text-muted);
	}
	.taken :global(.input) {
		min-height: 44px;
		width: auto;
	}
	.taken .hint {
		font-size: 13px;
		color: var(--text-muted);
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
