<script lang="ts">
	import { enhance } from '$app/forms';
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
	const STATUS: Record<string, { text: string; level: string }> = {
		thriving: { text: '✓ Thriving', level: 'ok' },
		melting: { text: '▲ Melting', level: 'warn' },
		algae: { text: '▲ Algae', level: 'warn' },
		other: { text: '– Other', level: 'none' }
	};

	let adding = $state(false);
	let trimming = $state(false);
	let editing = $state<(typeof data.plants)[number] | null>(null);
	let editOpen = $state(false);
	const close = () => async ({ update }: { update: () => Promise<void> }) => {
		adding = trimming = editOpen = false;
		await update();
	};
</script>

<svelte:head><title>Plants · {data.tankHead.name}</title></svelte:head>

<div class="body">
	<div class="top">
		{#if data.plants.length}<button type="button" class="btn" onclick={() => (trimming = true)}>Log trim</button>{/if}
		<button type="button" class="btn" onclick={() => (adding = true)}>+ Add</button>
	</div>
	{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}

	{#if !data.plants.length}
		<div class="card empty">
			<strong>No plants yet</strong>
			<span class="muted">Add stems, carpets, epiphytes and mosses to track how they're doing.</span>
			<button type="button" class="btn btn-primary" onclick={() => (adding = true)}>Add plant</button>
		</div>
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
									<span class="status-{STATUS[p.status].level} strong">{STATUS[p.status].text}</span>
									{#if p.trimmed}<span class="muted"> · Trimmed {p.trimmed}</span>{/if}
								</span>
							</span>
						</button>
					{/each}
				</div>
			</section>
		{/if}
	{/each}
</div>

<Sheet bind:open={adding} title="Add plant" width={480}>
	<form method="POST" action="?/add" class="sheet-form" use:enhance={close}>
		<SpeciesInput id="plant-name" kind="plant" water="fresh" label="Plant" />
		<fieldset class="field">
			<legend class="label">Position</legend>
			<div class="opts">
				{#each POSITIONS as o (o.v)}<label class="option"><input type="radio" name="position" value={o.v} defaultChecked={o.v === 'midground'} />{o.l}</label>{/each}
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
					<div class="opts">
						{#each Object.entries(STATUS) as [v, s] (v)}<label class="option"><input type="radio" name="status" value={v} defaultChecked={editing.status === v} />{s.text.slice(2)}</label>{/each}
					</div>
				</fieldset>
				<fieldset class="field">
					<legend class="label">Position</legend>
					<div class="opts">
						{#each POSITIONS as o (o.v)}<label class="option"><input type="radio" name="position" value={o.v} defaultChecked={editing.position === o.v} />{o.l}</label>{/each}
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

<Sheet bind:open={trimming} title="Log trim" width={480}>
	<form method="POST" action="?/trim" class="sheet-form" use:enhance={close}>
		<fieldset class="field">
			<legend class="label">What did you trim?</legend>
			<div class="opts">
				{#each data.plants as p (p.id)}<label class="option"><input type="checkbox" name="plant" value={p.id} />{p.name}</label>{/each}
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
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.top {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	.top .btn {
		min-height: 38px;
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
	.plant {
		padding: 12px;
		display: flex;
		gap: 12px;
		align-items: center;
		text-align: left;
		width: 100%;
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
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.name {
		font-size: 16px;
		font-weight: 600;
	}
	.sci {
		font-size: 13px;
		font-style: italic;
		color: var(--text-muted);
	}
	.meta {
		font-size: 13px;
	}
	.strong {
		font-weight: 600;
	}
	.empty {
		padding: 18px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
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
	.opts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.opts .option {
		padding: 0 14px;
		min-height: 44px;
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
