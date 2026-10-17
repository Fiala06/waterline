<script lang="ts">
	// Log plant health (#85): the plants, what they're doing as chips (✓ Thriving,
	// ▲ Melting, ✕ Removed…), when, a note and photos. Works without scripts.
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import DateField from '$lib/components/DateField.svelte';

	let { data, form } = $props();
	const v = $derived(form?.values);
	const errors = $derived(form?.errors ?? {});
	let chosen = $state(untrack(() => form?.values?.plantIds ?? (data.preselect ? [data.preselect] : data.plants.length === 1 ? [data.plants[0].id] : [])));
	let date = $state(untrack(() => form?.values?.date || data.now.date));
	let busy = $state(false);
</script>

<svelte:head><title>Log plant health · {data.tank.name}</title></svelte:head>

<form
	method="POST"
	action="?/save"
	enctype="multipart/form-data"
	class="hform"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<input type="hidden" name="from" value={data.from} />
	<div class="bar hide-desk">
		<a class="cancel" href={data.from}>Cancel</a>
		<h1>Log plant health</h1>
		<button class="save-top" disabled={busy}>Save</button>
	</div>

	<div class="body">
		{#if errors.when}<p class="banner banner-bad" role="alert">✕ {errors.when}</p>{/if}

		{#if data.plants.length}
			<fieldset class="field">
				<legend class="label">Which plants</legend>
				<div class="rows who" class:invalid={!!errors.plants}>
					{#each data.plants as p (p.id)}
						<label class="check-row">
							<input type="checkbox" name="plant" value={p.id} bind:group={chosen} />
							<span class="who-name">{p.name}</span>
						</label>
					{/each}
				</div>
				{#if errors.plants}<span class="error-text">✕ {errors.plants}</span>{/if}
			</fieldset>
		{:else}
			<p class="banner banner-warn">No plants in this tank yet. <a href="/tanks/{data.tank.id}/plants">Add plants</a> first.</p>
		{/if}

		<fieldset class="field">
			<legend class="label">What you noticed</legend>
			<div class="chips">
				{#each data.observations as o (o.value)}
					<label class="chip"><input type="radio" name="observation" value={o.value} defaultChecked={v?.observation === o.value} />{o.glyph} {o.label}</label>
				{/each}
			</div>
			{#if errors.observation}<span class="error-text">✕ {errors.observation}</span>{/if}
			<span class="hint">The plant's status on Plants follows; Removed takes it off the list.</span>
		</fieldset>

		<div class="when">
			<div class="field">
				<label class="label" for="ph-date">Date</label>
				<DateField name="date" id="ph-date" bind:value={date} required label="Date" max={data.today} today={data.today} />
			</div>
			<div class="field">
				<label class="label" for="ph-time">Time</label>
				<input class="input" id="ph-time" type="time" name="time" required defaultValue={v?.time || data.now.time} />
			</div>
		</div>

		<div class="field">
			<label class="label" for="ph-note">Note · optional</label>
			<textarea class="input" id="ph-note" name="note" rows="3" maxlength="4000" defaultValue={v?.note ?? ''} placeholder="Which leaves, since when, what changed"></textarea>
		</div>

		<div class="field">
			<label class="label" for="ph-photos">Photos · optional</label>
			<input id="ph-photos" type="file" name="photos" accept="image/*" multiple />
			{#if errors.photos}<span class="error-text">✕ {errors.photos}</span>{/if}
		</div>
	</div>

	<div class="foot">
		<button class="btn btn-primary save" disabled={busy || !data.plants.length}>Save</button>
		<a class="btn cancel-btn hide-phone" href={data.from}>Cancel</a>
	</div>
</form>

<style>
	.hform {
		display: flex;
		flex-direction: column;
		max-width: 560px;
	}
	.bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 4px 20px 8px;
	}
	.cancel {
		justify-self: start;
		font-size: 16px;
		color: var(--text-muted);
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
	}
	.save-top {
		justify-self: end;
		color: var(--accent-text);
		font-weight: 700;
		font-size: 16px;
		min-height: 44px;
	}
	.save-top:disabled {
		opacity: 0.45;
	}
	.body {
		padding: 8px 20px 12px;
		display: flex;
		flex-direction: column;
		gap: 20px;
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
	.who {
		border-top: 2px solid var(--ink);
	}
	.who .check-row {
		border-bottom: 1px solid var(--divider);
		gap: 12px;
	}
	.who.invalid {
		border-top-color: var(--bad);
	}
	.who-name {
		flex: 1;
		min-width: 0;
	}
	.hint {
		display: block;
		margin-top: 8px;
		font-size: 13px;
		color: var(--text-muted);
	}
	.when {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 10px;
	}
	.banner a {
		text-decoration: underline;
	}
	.foot {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.save {
		height: 56px;
		font-size: 17px;
	}
	@media (min-width: 1024px) {
		.hform {
			max-width: 640px;
			padding: 24px 32px 40px;
		}
		.body {
			padding: 0;
		}
		.foot {
			margin-top: 20px;
			padding: 16px 0 0;
			border-top: 2px solid var(--divider);
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
		}
		.save {
			height: 44px;
			padding: 0 22px;
			font-size: 14px;
		}
		.cancel-btn {
			border: none;
			color: var(--text-muted);
		}
	}
</style>
