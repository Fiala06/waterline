<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { getContext, onDestroy } from 'svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ImportButton from '$lib/components/ImportButton.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import SpeciesInput from '$lib/components/SpeciesInput.svelte';
	let { data, form } = $props();

	const GROUPS = [
		// on the surface, like water lettuce and frogbit
		{ key: 'floating', label: 'Floating', match: ['floating'] },
		{ key: 'background', label: 'Background', match: ['background'] },
		{ key: 'midground', label: 'Midground & epiphytes', match: ['midground', 'epiphyte'] },
		{ key: 'foreground', label: 'Foreground', match: ['foreground'] }
	];
	const POSITIONS = [
		{ v: 'background', l: 'Background' },
		{ v: 'midground', l: 'Midground' },
		{ v: 'foreground', l: 'Foreground' },
		{ v: 'epiphyte', l: 'Epiphyte' },
		{ v: 'floating', l: 'Floating' }
	];
	const STATUS: Record<string, { text: string; label: string; level: string }> = {
		thriving: { text: '✓ Thriving', label: 'Thriving', level: 'ok' },
		melting: { text: '▲ Melting', label: 'Melting', level: 'warn' },
		algae: { text: '▲ Algae', label: 'Algae', level: 'warn' },
		other: { text: '– Other', label: 'Other', level: 'none' }
	};

	// "Log trim" and "+ Add" are in the tank header (layout), which opens these sheets.
	const sheets = getContext<{ add: boolean; trim: boolean }>('plant-sheets');
	onDestroy(() => {
		sheets.add = sheets.trim = false;
	});
	let editing = $state<(typeof data.plants)[number] | null>(null);
	// species photos still on their way from Wikimedia: look again in a moment, a few times
	let tries = 0;
	$effect(() => {
		if (!data.photosPending || tries >= 4) return;
		const t = setTimeout(() => {
			tries++;
			invalidateAll();
		}, 2500);
		return () => clearTimeout(t);
	});
	// keep the open sheet in step when the list comes back
	$effect(() => {
		const now = editing && data.plants.find((p) => p.id === editing!.id);
		if (now && now !== editing) editing = now;
	});
	let editOpen = $state(false);
	const close = () => async ({ update }: { update: () => Promise<void> }) => {
		sheets.add = sheets.trim = editOpen = false;
		await update();
	};
</script>

<svelte:head><title>Plants · {data.tankHead.name}</title></svelte:head>

<div class="body">
	{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}

	{#if !data.plants.length}
		<EmptyState icon="plant" title="No plants yet" text="Add stems, carpets, epiphytes and mosses to track how they're doing.">
			<button type="button" class="btn btn-primary" onclick={() => (sheets.add = true)}>Add plant</button>
			<a class="btn" href="/tanks/{data.tankHead.id}/plants/several">Add several at once</a>
		</EmptyState>
	{/if}

	{#each GROUPS as g (g.key)}
		{@const list = data.plants.filter((p) => g.match.includes(p.position))}
		{#if list.length}
			<section>
				<h2 class="caps">{g.label}</h2>
				<div class="grid">
					{#each list as p (p.id)}
						<button
							type="button"
							class="card plant"
							onclick={() => {
								editing = p;
								editOpen = true;
							}}
						>
							{#if p.photo}<img class="thumb" src={p.photo.src} alt="" loading="lazy" />{:else}<span class="thumb photo-placeholder"></span>{/if}
							<span class="text">
								<span class="name">{p.name}</span>
								{#if p.scientific && p.scientific !== p.name}<span class="sci">{p.scientific}</span>{/if}
								<span class="meta">
									<span class="status-tag sm tag-{STATUS[p.status].level}">{STATUS[p.status].text}</span>
									{#if p.trimmed}<span class="when">Trimmed {p.trimmed}</span>{/if}
								</span>
							</span>
						</button>
					{/each}
				</div>
			</section>
		{/if}
	{/each}
	<!-- below the list, or below the empty box: in the same place on every tab -->
	<ImportButton href="/tanks/{data.tankHead.id}/import/plants" />
</div>

<Sheet bind:open={sheets.add} title="Add plant" width={480}>
	<form method="POST" action="?/add" class="sheet-form" use:enhance={close}>
		<SpeciesInput id="plant-name" kind="plant" water="fresh" label="Plant" />
		<fieldset class="field">
			<legend class="label">Position</legend>
			<div class="chips">
				{#each POSITIONS as o (o.v)}<label class="chip"><input type="radio" name="position" value={o.v} defaultChecked={o.v === 'midground'} />{o.l}</label>{/each}
			</div>
		</fieldset>
		<input type="hidden" name="status" value="thriving" />
		<button class="btn btn-primary btn-lg">Add plant</button>
	</form>
</Sheet>

<Sheet bind:open={editOpen} title={editing?.name ?? 'Plant'} width={480}>
	{#if editing}
		{#key editing.id}
			<div class="photo-part">
				{#if editing.photo}
					<figure class="big">
						<img src={editing.photo.large} alt={editing.name} />
						{#if editing.photo.credit}
							{@const c = editing.photo.credit}
							<figcaption>
								Photo: {c.author} · {#if c.licenseUrl}<a href={c.licenseUrl} target="_blank" rel="noopener noreferrer">{c.license}</a>{:else}{c.license}{/if} ·
								<a href={c.pageUrl} target="_blank" rel="noopener noreferrer">Wikimedia Commons<span aria-hidden="true"> ↗</span></a>
							</figcaption>
						{/if}
					</figure>
				{/if}
				<form method="POST" action="?/photo" enctype="multipart/form-data" class="photo-acts" use:enhance={close}>
					<input type="hidden" name="id" value={editing.id} />
					<label class="btn file"
						>{editing.ownPhoto ? 'Change photo' : 'Add your photo'}<input
							type="file"
							name="photo"
							accept="image/*"
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
						/></label
					>
					{#if editing.ownPhoto}<button class="btn-text remove-photo" formaction="?/removePhoto">Remove photo</button>{/if}
					<noscript><button class="btn">Upload</button></noscript>
				</form>
				<p class="hint">Or open one in Photos and choose Use as the photo for {editing.name}.</p>
			</div>
			<form method="POST" action="?/update" class="sheet-form" use:enhance={close}>
				<input type="hidden" name="id" value={editing.id} />
				<fieldset class="field">
					<legend class="label">Status</legend>
					<div class="chips">
						{#each Object.entries(STATUS) as [v, s] (v)}<label class="chip"><input type="radio" name="status" value={v} defaultChecked={editing.status === v} />{s.label}</label>{/each}
					</div>
				</fieldset>
				<fieldset class="field">
					<legend class="label">Position</legend>
					<div class="chips">
						{#each POSITIONS as o (o.v)}<label class="chip"><input type="radio" name="position" value={o.v} defaultChecked={editing.position === o.v} />{o.l}</label>{/each}
					</div>
				</fieldset>
				<div class="row">
					<button class="btn btn-danger" formaction="?/remove">Remove</button>
					<button class="btn btn-primary grow">Save</button>
				</div>
			</form>
		{/key}
	{/if}
</Sheet>

<Sheet bind:open={sheets.trim} title="Log trim" width={480}>
	<form method="POST" action="?/trim" class="sheet-form" use:enhance={close}>
		<fieldset class="field">
			<legend class="label">What did you trim?</legend>
			<div class="chips">
				{#each data.plants as p (p.id)}<label class="chip"><input type="checkbox" name="plant" value={p.id} />{p.name}</label>{/each}
			</div>
		</fieldset>
		<div class="field">
			<label class="label" for="trim-note">Note</label>
			<input class="input" id="trim-note" name="note" maxlength="500" placeholder="Optional, e.g. replanted tops" />
		</div>
		<p class="hint">Adds a maintenance entry to History.</p>
		<button class="btn btn-primary btn-lg">Log trim</button>
	</form>
</Sheet>

<style>
	.body {
		padding: 14px 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.caps {
		margin: 0;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.grid {
		display: grid;
		gap: 8px;
	}
	/* T7 */
	.plant {
		padding: 12px;
		display: flex;
		gap: 12px;
		align-items: center;
		text-align: left;
		width: 100%;
		color: var(--text);
	}
	.plant:hover {
		border-color: var(--border-strong);
	}
	.thumb {
		width: 52px;
		height: 52px;
		border-radius: 10px;
		flex-shrink: 0;
		border: none;
		object-fit: cover;
		background: var(--surface-2);
	}
	/* the plant's sheet: its photo, the credit a species photo needs, and the keeper's own */
	.photo-part {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 16px;
	}
	.big {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.big img {
		width: 100%;
		max-height: 260px;
		object-fit: cover;
		border-radius: 14px;
		background: var(--surface-2);
	}
	figcaption {
		font-size: 12px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	figcaption a {
		color: var(--text-2);
		text-decoration: underline;
	}
	.photo-acts {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.file {
		position: relative;
		overflow: hidden;
	}
	.file input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.remove-photo {
		min-height: 44px;
		color: var(--text-muted);
	}
	.text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.name,
	.sci {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.name {
		font-size: 16px;
		font-weight: 600;
	}
	.sci {
		font-size: 12px;
		font-style: italic;
		color: var(--text-muted);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 1px;
	}
	.when {
		font-size: 12px;
		color: var(--text-faint);
		white-space: nowrap;
	}
	.sheet-form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 8px;
	}
	.row {
		display: flex;
		gap: 10px;
	}
	.grow {
		flex: 1;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
	}
	@media (min-width: 1024px) {
		.body {
			padding: 24px 32px;
			max-width: 1100px;
		}
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		}
	}
</style>
