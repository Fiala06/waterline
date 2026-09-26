<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import { photoUrl } from '$lib/media';
	import { untrack } from 'svelte';
	let { data, form } = $props();
	let coverPreview = $state<string | null>(null);
	let notes = $state(untrack(() => data.tank.notes));
	function pickCover(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (coverPreview) URL.revokeObjectURL(coverPreview);
		coverPreview = f ? URL.createObjectURL(f) : null;
	}
	const errors = $derived((form?.errors ?? {}) as Record<string, string>);
	const types = [
		{ value: 'freshwater', label: 'Fresh' },
		{ value: 'planted', label: 'Planted' },
		{ value: 'brackish', label: 'Brackish' },
		{ value: 'reef', label: 'Reef' }
	];
</script>

<svelte:head><title>Edit {data.tank.name} · Waterline</title></svelte:head>

<form method="POST" action="?/save" enctype="multipart/form-data" class="wrap" use:enhance>
	<div class="cols">
		<div class="body">
			<div class="cover" class:photo-placeholder={!coverPreview && !data.tank.cover}>
				{#if coverPreview || data.tank.cover}
					<img src={coverPreview ?? photoUrl(data.tank.cover!, 'full')} alt="Tank cover" />
				{:else}
					<span class="mono">cover photo</span>
				{/if}
				<label class="change">
					Change
					<input type="file" name="cover" accept="image/*" onchange={pickCover} />
				</label>
			</div>
			{#if errors.cover}<span class="error-text">✕ {errors.cover}</span>{/if}

			<div class="field">
				<label class="label" for="name">Name</label>
				<input class="input" id="name" name="name" defaultValue={data.tank.name} required maxlength="80" />
				{#if errors.name}<span class="error-text">✕ {errors.name}</span>{/if}
			</div>

			<fieldset class="field">
				<legend class="label">Type</legend>
				<div class="options four">
					{#each types as t (t.value)}
						<label class="option"><input type="radio" name="type" value={t.value} defaultChecked={data.tank.type === t.value} />{t.label}</label>
					{/each}
				</div>
			</fieldset>

			<div class="pair">
				<div class="field">
					<label class="label" for="nominalVolume">Nominal volume</label>
					<div class="unit-input">
						<input id="nominalVolume" name="nominalVolume" inputmode="decimal" defaultValue={data.tank.nominalVolume} />
						<span class="unit">{data.volUnit}</span>
					</div>
					{#if errors.nominalVolume}<span class="error-text">✕ {errors.nominalVolume}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="actualVolume">Actual volume</label>
					<div class="unit-input">
						<input id="actualVolume" name="actualVolume" inputmode="decimal" defaultValue={data.tank.actualVolume} />
						<span class="unit">{data.volUnit}</span>
					</div>
					{#if errors.actualVolume}<span class="error-text">✕ {errors.actualVolume}</span>{/if}
				</div>
			</div>

			<fieldset class="field">
				<legend class="label">Dimensions (L × W × H)</legend>
				<div class="triple">
					{#each [['length', 'Length'], ['width', 'Width'], ['height', 'Height']] as [key, label] (key)}
						<div class="unit-input">
							<input name={key} inputmode="decimal" aria-label={label} defaultValue={data.tank[key as 'length' | 'width' | 'height']} />
							<span class="unit">{data.lenUnit}</span>
						</div>
					{/each}
				</div>
			</fieldset>

			<div class="pair">
				<div class="field">
					<label class="label" for="specBrand">Tank brand</label>
					<input class="input" id="specBrand" name="specBrand" defaultValue={data.tank.specBrand} maxlength="60" placeholder="e.g. Aqualine" />
				</div>
				<div class="field">
					<label class="label" for="specModel">Model</label>
					<input class="input" id="specModel" name="specModel" defaultValue={data.tank.specModel} maxlength="60" placeholder="e.g. 90P" />
				</div>
			</div>
			<div class="pair">
				<div class="field">
					<label class="label" for="glass">Glass</label>
					<input class="input" id="glass" name="glass" defaultValue={data.tank.glass} maxlength="60" placeholder="e.g. Low-iron, rimless" />
				</div>
				<div class="field">
					<label class="label" for="substrate">Substrate</label>
					<input class="input" id="substrate" name="substrate" defaultValue={data.tank.substrate} maxlength="60" placeholder="e.g. Aquasoil, 3 in" />
				</div>
			</div>
			<div class="pair">
				<div class="field">
					<label class="label" for="waterSource">Water source</label>
					<select class="input" id="waterSource" name="waterSource">
						{#each [['', '—'], ['tap', 'Tap'], ['rodi', 'RODI'], ['mix', 'Mix'], ['well', 'Well']] as [v, l] (v)}
							<option value={v} selected={data.tank.waterSource === v}>{l}</option>
						{/each}
					</select>
				</div>
				<div class="field">
					<label class="label" for="photoperiodH">Photoperiod</label>
					<div class="unit-input">
						<input id="photoperiodH" name="photoperiodH" inputmode="decimal" defaultValue={data.tank.photoperiodH} />
						<span class="unit">h</span>
					</div>
				</div>
			</div>

			<div class="field">
				<label class="label" for="startDate">Start date</label>
				<input class="input" id="startDate" name="startDate" type="date" defaultValue={data.tank.startDate} />
			</div>

			<div class="field">
				<label class="label" for="notes">Notes</label>
				<textarea class="input" id="notes" name="notes" rows="3" maxlength="2000" bind:value={notes}></textarea>
			</div>
		</div>

		<div class="side">
			<a class="card params" href="/tanks/{data.tank.id}/public">
				<div>
					<div class="p-title">Public page</div>
					<div class="muted sm">{data.publicLive ? '● Live · read-only page anyone with the link can see' : 'Off · share a read-only page of this tank'}</div>
				</div>
				<span class="link">Set up ›</span>
			</a>

			<a class="card params" href="/tanks/{data.tank.id}/targets">
				<div>
					<div class="p-title">Parameters</div>
					<div class="muted sm">
						{data.paramSummary.tracked} tracked{data.paramSummary.custom ? ` · ${data.paramSummary.custom} custom` : ''}
					</div>
					<div class="faint sm">{data.paramSummary.names}</div>
				</div>
				<span class="link">Targets ›</span>
			</a>

			{#if !data.tank.archived}
				<div class="archive">
					<button type="button" class="btn btn-danger" popovertarget="confirm-archive">Archive tank</button>
					<p class="faint sm">History is kept. Archived tanks can be restored.</p>
				</div>
			{/if}
			<button class="btn btn-primary btn-lg">Save changes</button>
		</div>
	</div>
</form>

<ConfirmDelete
	id="confirm-archive"
	trigger={false}
	title="Archive {data.tank.name}?"
	body="It moves to Archived. The history is kept and you can restore it any time."
	action="?/archive"
	label="Archive"
	tone="primary"
/>

<style>
	.wrap {
		max-width: 1100px;
		padding-bottom: calc(24px + env(safe-area-inset-bottom));
	}
	.cols,
	.body,
	.side {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.cols {
		padding: 8px 20px;
	}
	.cover {
		position: relative;
		height: 140px;
		border-radius: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		color: var(--text-faint);
		overflow: hidden;
	}
	.cover img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.change {
		position: absolute;
		right: 10px;
		bottom: 10px;
		height: 36px;
		padding: 0 14px;
		border-radius: 18px;
		background: rgba(3, 10, 12, 0.75);
		color: #e6f0f0;
		font-size: 14px;
		font-weight: 600;
		display: flex;
		align-items: center;
		cursor: pointer;
	}
	.change input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.change:focus-within {
		outline: 2px solid var(--accent);
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
	.four {
		grid-template-columns: repeat(4, 1fr);
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.triple {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.triple .unit-input {
		padding: 0 12px;
	}
	.params {
		padding: 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		color: var(--text);
	}
	.p-title {
		font-size: 17px;
		font-weight: 600;
		margin-bottom: 4px;
	}
	.sm {
		font-size: 13px;
	}
	.link {
		color: var(--accent);
		font-weight: 600;
		white-space: nowrap;
	}
	.archive {
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: flex-start;
	}
	.archive p {
		margin: 0;
	}
	@media (min-width: 1024px) {
		.cols {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 340px;
			gap: 28px;
			padding: 16px 32px;
			align-items: start;
		}
	}
</style>
