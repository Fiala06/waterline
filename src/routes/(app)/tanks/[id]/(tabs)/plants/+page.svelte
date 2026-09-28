<script lang="ts">
	import { enhance } from '$app/forms';
	import { getContext, onDestroy } from 'svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ImportButton from '$lib/components/ImportButton.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import SpeciesInput from '$lib/components/SpeciesInput.svelte';
	let { data, form } = $props();

	const GROUPS = [
		{ key: 'background', label: 'Background', match: ['background'] },
		{ key: 'midground', label: 'Midground & epiphytes', match: ['midground', 'epiphyte'] },
		{ key: 'foreground', label: 'Foreground', match: ['foreground'] }
	];
	const POSITIONS = [
		{ v: 'background', l: 'Background' },
		{ v: 'midground', l: 'Midground' },
		{ v: 'foreground', l: 'Foreground' },
		{ v: 'epiphyte', l: 'Epiphyte' }
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
							<span class="thumb photo-placeholder"></span>
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
