<script lang="ts">
	import { enhance } from '$app/forms';
	import Tip from '$lib/components/Tip.svelte';
	import { TIPS } from '$lib/tips';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import { photoUrl } from '$lib/media';
	import { untrack } from 'svelte';
	let { data, form } = $props();
	let coverPreview = $state<string | null>(null);
	let notes = $state(untrack(() => data.tank.notes));
	let startDate = $state(untrack(() => data.tank.startDate));
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
					<div class="label-row">
						<label class="label" for="nominalVolume">Nominal volume</label><Tip text={TIPS.nominalVolume} label="About nominal volume" />
					</div>
					<div class="unit-input">
						<input id="nominalVolume" name="nominalVolume" inputmode="decimal" defaultValue={data.tank.nominalVolume} />
						<span class="unit">{data.volUnit}</span>
					</div>
					{#if errors.nominalVolume}<span class="error-text">✕ {errors.nominalVolume}</span>{/if}
				</div>
				<div class="field">
					<div class="label-row">
						<label class="label" for="actualVolume">Actual volume</label><Tip text={TIPS.actualVolume} label="About actual volume" />
					</div>
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
				<DateField name="startDate" id="startDate" bind:value={startDate} label="Start date" today={data.today} max={data.today} invalid={!!errors.startDate} />
				{#if errors.startDate}<span class="error-text">✕ {errors.startDate}</span>{/if}
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
					<div class="muted sm">
						{#if data.publicLive}<span class="live">● Live</span>{' · read-only page anyone with the link can see'}{:else}Off · share a read-only page of this tank{/if}
					</div>
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

			<button class="btn btn-primary btn-lg save">Save changes</button>
			{#if !data.tank.archived}
				<!-- reversible, so amber rather than red (10) -->
				<div class="archive">
					<button type="button" class="btn btn-warn" popovertarget="confirm-archive">Archive tank</button>
					<p class="faint sm">History is kept. Archived tanks can be restored.</p>
				</div>
			{/if}
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
	tone="warn"
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
		padding: 20px 20px 8px;
	}
	.cover {
		position: relative;
		height: 160px;
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
		padding: 0 12px;
		border-radius: 10px;
		background: var(--overlay-bg);
		color: var(--overlay-text);
		border: 1px solid var(--border-strong);
		font-size: 14px;
		font-weight: 600;
		display: flex;
		align-items: center;
		cursor: pointer;
	}
	/* 36px to match 10, 44px to tap */
	.change input {
		position: absolute;
		inset: -4px -1px;
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
	.live {
		color: var(--ok);
		font-weight: 600;
	}
	.archive {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 4px;
	}
	.archive .btn {
		height: 52px;
		border-radius: 14px;
		font-size: 16px;
	}
	.archive p {
		margin: 0;
		text-align: center;
	}
	@media (min-width: 1024px) {
		.cols {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 340px;
			gap: 28px;
			padding: 24px 32px;
			align-items: start;
		}
		.save {
			height: 48px;
			border-radius: 12px;
			font-size: 16px;
		}
		.archive .btn {
			height: 48px;
			border-radius: 12px;
		}
	}
</style>
