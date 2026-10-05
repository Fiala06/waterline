<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { getContext, onDestroy } from 'svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ImportButton from '$lib/components/ImportButton.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import SpeciesInput from '$lib/components/SpeciesInput.svelte';
	import SortHeader from '$lib/components/SortHeader.svelte';
	import SortMenu from '$lib/components/SortMenu.svelte';
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
	// a row's Trim button opens the sheet with that plant ticked
	let trimPick = $state<string | null>(null);
	const close = () => async ({ update }: { update: () => Promise<void> }) => {
		sheets.add = sheets.trim = editOpen = false;
		trimPick = null;
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
	{:else}
		<!-- phones hide the headers: the same sorts as a menu (#79) -->
		<SortMenu
			class="hide-desk sort-phone"
			sort={data.sort}
			first="By placement"
			options={[
				{ key: 'plant', dir: 'asc', label: 'Plant A–Z' },
				{ key: 'added', dir: 'desc', label: 'Newest added' },
				{ key: 'trimmed', dir: 'desc', label: 'Trimmed most recently' },
				{ key: 'trimmed', dir: 'asc', label: 'Trimmed longest ago' },
				{ key: 'status', dir: 'desc', label: 'Needs a look first' }
			]}
		/>
		<div class="table" class:no-added={!data.showAdded} role="table" aria-label="Plants">
			<div class="thead" role="row" aria-rowindex="1">
				<SortHeader key="plant" label="Plant" sort={data.sort} /><SortHeader key="placement" label="Placement" sort={data.sort} />{#if data.showAdded}<SortHeader
						key="added"
						label="Added"
						sort={data.sort}
						first="desc"
					/>{/if}<SortHeader key="trimmed" label="Last trimmed" sort={data.sort} first="desc" /><SortHeader key="status" label="Status" sort={data.sort} />
			</div>
			{#snippet plantRow(p: (typeof data.plants)[number])}
							<div class="tr" role="row">
								<div class="pl" role="cell">
									<!-- the plant opens its sheet (status, placement, photo) -->
									<button
										type="button"
										class="plant"
										onclick={() => {
											editing = p;
											editOpen = true;
										}}
									>
										{#if p.photo}<img class="thumb" src={p.photo.src} alt="" loading="lazy" />{:else}<span class="thumb photo-placeholder"></span>{/if}
										<span class="text">
											<span class="name">{p.name}</span>
											{#if p.scientific && p.scientific !== p.name}<span class="sci">{p.scientific}</span>{/if}
										</span>
									</button>
								</div>
								<span class="d" role="cell">{POSITIONS.find((o) => o.v === p.position)?.l}</span>
								{#if data.showAdded}<span class="d" role="cell">{p.added}</span>{/if}
								<span class="trim" role="cell">
									<span class="when" class:none={!p.trimmed}>{p.trimmed ? `Trimmed ${p.trimmed}` : 'Never'}</span>
									<button
										type="button"
										class="ghost"
										onclick={() => {
											trimPick = p.id;
											sheets.trim = true;
										}}>Trim</button
									>
								</span>
								<span class="st status-{STATUS[p.status].level}" role="cell">{STATUS[p.status].text}</span>
							</div>
			{/snippet}
			{#if data.sort}
				<!-- sorted by a column (#79): one list; the placement groups are the order otherwise -->
				<div class="group" role="rowgroup">
					{#each data.plants as p (p.id)}{@render plantRow(p)}{/each}
				</div>
			{:else}
				{#each GROUPS as g (g.key)}
					{@const list = data.plants.filter((p) => g.match.includes(p.position))}
					{#if list.length}
						<div class="group" role="rowgroup">
							<div class="group-head" role="row"><span class="kicker" role="cell" aria-colspan={data.showAdded ? 5 : 4}><h2>{g.label}</h2></span></div>
							{#each list as p (p.id)}{@render plantRow(p)}{/each}
						</div>
					{/if}
				{/each}
			{/if}
		</div>
	{/if}
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
				{#each data.plants as p (p.id)}<label class="chip"><input type="checkbox" name="plant" value={p.id} checked={trimPick === p.id} />{p.name}</label>{/each}
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
		padding: 16px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.ghost {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin: -10px 0;
		padding: 0 4px;
		font-size: 13px;
		font-weight: 800;
		color: var(--accent-text);
		white-space: nowrap;
	}
	/* the table: a header over a 2px ink rule, rows with 1px dividers, grouped by placement */
	.table {
		display: flex;
		flex-direction: column;
	}
	.thead {
		display: none;
	}
	.group {
		display: flex;
		flex-direction: column;
	}
	.group-head {
		display: block;
	}
	.group-head .kicker {
		display: block;
		padding: 14px 0 6px;
		border-bottom: 2px solid var(--ink);
	}
	.group h2 {
		margin: 0;
		font: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
		color: var(--text);
	}
	.tr {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas: 'pl st' 'trim trim';
		align-items: center;
		gap: 6px 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--divider);
	}
	.d {
		display: none;
	}
	.pl {
		grid-area: pl;
		display: flex;
		min-width: 0;
	}
	.plant {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		text-align: left;
		color: var(--text);
	}
	.plant:hover .name {
		color: var(--accent-text);
	}
	.thumb {
		width: 40px;
		height: 40px;
		flex-shrink: 0;
		border: none;
		object-fit: cover;
		background: var(--surface);
	}
	.text {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.name {
		font-size: 15px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.sci {
		font-size: 12px;
		font-style: italic;
		color: var(--text-muted);
	}
	.trim {
		grid-area: trim;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 8px;
		font-size: 14px;
		min-width: 0;
	}
	.trim .when {
		min-width: 52px;
	}
	.trim .when.none {
		color: var(--text-muted);
	}
	.st {
		grid-area: st;
		font-size: 13px;
		font-weight: 800;
		white-space: nowrap;
	}
	.st.status-ok {
		color: var(--text-muted) !important;
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
		background: var(--surface);
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
		color: var(--text-muted);
	}
	@media (hover: hover) {
		.ghost:hover {
			background: color-mix(in srgb, var(--accent) 10%, transparent);
		}
	}
	/* Desktop: `1fr 120px 90px 170px 110px` (the design's Type column has no data yet) */
	@media (min-width: 1024px) {
		.body {
			padding: 24px 32px 48px;
		}
		.thead,
		.tr {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 120px 90px 170px 110px;
			grid-template-areas: none;
			column-gap: 16px;
			align-items: center;
		}
		.thead {
			padding: 8px 0;
			border-bottom: 2px solid var(--ink);
			font-size: 11px;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--text-muted);
		}
		.group h2 {
			padding: 12px 0 4px;
			border-bottom: 1px solid var(--divider);
		}
		.pl,
		.trim,
		.st {
			grid-area: auto;
		}
		.d {
			display: block;
			font-size: 14px;
			white-space: nowrap;
		}
		.name,
		.sci {
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			max-width: 100%;
		}
	}
	@media (min-width: 1024px) and (max-width: 1199px) {
		.thead,
		.tr {
			grid-template-columns: minmax(0, 1fr) 100px 72px 150px 100px;
			column-gap: 10px;
		}
	}
	/* without Added (every plant on one day): four columns */
	@media (min-width: 1024px) {
		.no-added .thead,
		.no-added .tr {
			grid-template-columns: minmax(0, 1fr) 120px 170px 110px;
		}
	}
	@media (min-width: 1024px) and (max-width: 1199px) {
		.no-added .thead,
		.no-added .tr {
			grid-template-columns: minmax(0, 1fr) 100px 150px 100px;
		}
	}
</style>
