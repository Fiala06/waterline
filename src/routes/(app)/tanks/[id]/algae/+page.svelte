<script lang="ts">
	// Log algae (#86): which kind as chips, how much (– A little / ▲ Some / ✕ A lot),
	// where, when, a note and photos. Works without scripts.
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import DateField from '$lib/components/DateField.svelte';

	let { data, form } = $props();
	const v = $derived(form?.values);
	const errors = $derived(form?.errors ?? {});
	let date = $state(untrack(() => form?.values?.date || data.now.date));
	let busy = $state(false);
</script>

<svelte:head><title>Log algae · {data.tank.name}</title></svelte:head>

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
		<h1>Log algae</h1>
		<button class="save-top" disabled={busy}>Save</button>
	</div>

	<div class="body">
		{#if errors.when}<p class="banner banner-bad" role="alert">✕ {errors.when}</p>{/if}

		<fieldset class="field">
			<legend class="label">Which algae</legend>
			<div class="chips">
				{#each data.types as t (t)}
					<label class="chip"><input type="radio" name="algae" value={t} defaultChecked={v?.algae === t} />{t}</label>
				{/each}
			</div>
			{#if errors.algae}<span class="error-text">✕ {errors.algae}</span>{/if}
			<span class="hint">Not sure which? Other / unsure is fine: the photo and the trend tell the story later.</span>
		</fieldset>

		<fieldset class="field">
			<legend class="label">How much</legend>
			<div class="segmented amount">
				{#each data.severities as s (s.value)}
					<label><input type="radio" name="severity" value={s.value} defaultChecked={(v?.severity ?? 'moderate') === s.value} />{s.glyph} {s.label}</label>
				{/each}
			</div>
			{#if errors.severity}<span class="error-text">✕ {errors.severity}</span>{/if}
		</fieldset>

		<div class="field">
			<label class="label" for="al-area">Where · optional</label>
			<input class="input" id="al-area" name="area" maxlength="80" autocomplete="off" defaultValue={v?.area ?? ''} placeholder="e.g. front glass, Anubias leaves, driftwood" />
		</div>

		<div class="when">
			<div class="field">
				<label class="label" for="al-date">Date</label>
				<DateField name="date" id="al-date" bind:value={date} required label="Date" max={data.today} today={data.today} />
			</div>
			<div class="field">
				<label class="label" for="al-time">Time</label>
				<input class="input" id="al-time" type="time" name="time" required defaultValue={v?.time || data.now.time} />
			</div>
		</div>

		<div class="field">
			<label class="label" for="al-note">Note · optional</label>
			<textarea class="input" id="al-note" name="note" rows="3" maxlength="4000" defaultValue={v?.note ?? ''} placeholder="What changed lately: light, dosing, feeding"></textarea>
		</div>

		<div class="field">
			<label class="label" for="al-photos">Photos · optional</label>
			<input id="al-photos" type="file" name="photos" accept="image/*" multiple />
			{#if errors.photos}<span class="error-text">✕ {errors.photos}</span>{/if}
		</div>
	</div>

	<div class="foot">
		<button class="btn btn-primary save" disabled={busy}>Save</button>
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
	.hint {
		display: block;
		margin-top: 8px;
		font-size: 13px;
		color: var(--text-muted);
	}
	.amount {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.amount label {
		white-space: nowrap;
	}
	.when {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 10px;
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
