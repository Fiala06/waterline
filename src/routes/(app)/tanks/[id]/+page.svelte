<script lang="ts">
	import { enhance } from '$app/forms';
	import { photoUrl } from '$lib/media';
	let { data, form } = $props();
	let coverPreview = $state<string | null>(null);
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
	<div class="bar">
		<a href="/tanks" class="back">‹ Tanks</a>
		<h1>Edit tank</h1>
		<button class="btn-text save">Save</button>
	</div>

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
				<input class="input" id="name" name="name" value={data.tank.name} required maxlength="80" />
				{#if errors.name}<span class="error-text">✕ {errors.name}</span>{/if}
			</div>

			<fieldset class="field">
				<legend class="label">Type</legend>
				<div class="options four">
					{#each types as t (t.value)}
						<label class="option"><input type="radio" name="type" value={t.value} checked={data.tank.type === t.value} />{t.label}</label>
					{/each}
				</div>
			</fieldset>

			<div class="pair">
				<div class="field">
					<label class="label" for="nominalVolume">Nominal volume</label>
					<div class="unit-input">
						<input id="nominalVolume" name="nominalVolume" inputmode="decimal" value={data.tank.nominalVolume} />
						<span class="unit">{data.volUnit}</span>
					</div>
					{#if errors.nominalVolume}<span class="error-text">✕ {errors.nominalVolume}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="actualVolume">Actual volume</label>
					<div class="unit-input">
						<input id="actualVolume" name="actualVolume" inputmode="decimal" value={data.tank.actualVolume} />
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
							<input name={key} inputmode="decimal" aria-label={label} value={data.tank[key as 'length' | 'width' | 'height']} />
							<span class="unit">{data.lenUnit}</span>
						</div>
					{/each}
				</div>
			</fieldset>

			<div class="field">
				<label class="label" for="startDate">Start date</label>
				<input class="input" id="startDate" name="startDate" type="date" value={data.tank.startDate} />
			</div>

			<div class="field">
				<label class="label" for="notes">Notes</label>
				<textarea class="input" id="notes" name="notes" rows="3" maxlength="2000">{data.tank.notes}</textarea>
			</div>
		</div>

		<div class="side">
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

<div id="confirm-archive" popover class="confirm">
	<h2>Archive {data.tank.name}?</h2>
	<p>It moves to Archived. The history is kept and you can restore it any time.</p>
	<div class="c-actions">
		<button type="button" class="btn" popovertarget="confirm-archive" popovertargetaction="hide">Cancel</button>
		<form method="POST" action="?/archive">
			<button class="btn btn-primary">Archive</button>
		</form>
	</div>
</div>

<style>
	.wrap {
		max-width: 1100px;
		padding-bottom: calc(24px + env(safe-area-inset-bottom));
	}
	.bar {
		position: sticky;
		top: 0;
		z-index: 5;
		background: var(--bg);
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 8px 12px;
	}
	.back {
		font-size: 15px;
		min-height: 44px;
		display: flex;
		align-items: center;
		padding: 0 8px;
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	.save {
		justify-self: end;
		min-height: 44px;
		font-size: 16px;
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
	.confirm {
		border: 1px solid var(--border-strong);
		border-radius: 20px;
		background: var(--surface);
		color: var(--text);
		padding: 22px;
		width: min(400px, calc(100vw - 40px));
		box-shadow: var(--shadow-modal);
	}
	.confirm::backdrop {
		background: var(--scrim);
	}
	.confirm h2 {
		margin: 0 0 8px;
		font-size: 19px;
	}
	.confirm p {
		margin: 0 0 18px;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.c-actions {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
	}
	@media (min-width: 1024px) {
		.cols {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 340px;
			gap: 28px;
			padding: 16px 32px;
			align-items: start;
		}
		.bar {
			padding: 16px 24px 0;
		}
	}
</style>
