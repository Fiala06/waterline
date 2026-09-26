<script lang="ts">
	import { untrack } from 'svelte';
	import { onMount } from 'svelte';
	let { data, form } = $props();

	let timeZone = $state(untrack(() => data.timeZone));
	let detected = $state(false);
	let changing = $state(false);
	let unitSystem = $state(untrack(() => data.unitSystem));

	onMount(() => {
		if (data.timeZoneSet) return;
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (tz) {
			timeZone = tz;
			detected = true;
		}
	});
	// "Pacific Time" where the browser knows a friendly name, else "America/Los Angeles"
	const tzLabel = $derived.by(() => {
		try {
			const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longGeneric' })
				.formatToParts(new Date())
				.find((p) => p.type === 'timeZoneName')?.value;
			if (name && !name.startsWith('GMT')) return name;
		} catch {
			/* fall through */
		}
		return timeZone.replace(/_/g, ' ');
	});
</script>

<svelte:head><title>Set up · Waterline</title></svelte:head>

<form method="POST" class="wrap">
	<div class="head">
		<div class="progress" aria-hidden="true"><i class="on"></i><i></i></div>
		<div class="step">Step 1 of 2</div>
		<h1>Set up your log</h1>
	</div>

	<div class="body">
		{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}
		<div class="field">
			<label class="label" for="displayName">Display name</label>
			<input class="input" id="displayName" name="displayName" value={data.displayName} required autocomplete="name" />
		</div>

		<fieldset class="field">
			<legend class="label">Units</legend>
			<div class="segmented">
				<label><input type="radio" name="unitSystem" value="imperial" bind:group={unitSystem} />Imperial<small>gal · °F · in</small></label>
				<label><input type="radio" name="unitSystem" value="metric" bind:group={unitSystem} />Metric<small>L · °C · cm</small></label>
			</div>
		</fieldset>

		<fieldset class="field">
			<legend class="label">Hardness units</legend>
			<div class="segmented">
				<label><input type="radio" name="hardnessUnit" value="dgh" checked={data.hardnessUnit === 'dgh'} />dGH / dKH</label>
				<label><input type="radio" name="hardnessUnit" value="ppm" checked={data.hardnessUnit === 'ppm'} />ppm</label>
			</div>
		</fieldset>

		<div class="field">
			<label class="label" for="timeZone">Time zone</label>
			{#if changing}
				<select class="input" id="timeZone" name="timeZone" bind:value={timeZone}>
					{#each data.timeZones as tz (tz)}<option value={tz}>{tz.replace(/_/g, ' ')}</option>{/each}
				</select>
			{:else}
				<input type="hidden" name="timeZone" value={timeZone} />
				<div class="input tz">
					<span>{tzLabel}{detected ? ' · detected' : ''}</span>
					<button type="button" class="btn-text" onclick={() => (changing = true)}>Change</button>
				</div>
			{/if}
		</div>
		<p class="hint">You can change these later in Settings.</p>
	</div>

	<div class="foot">
		<button class="btn btn-primary btn-lg" name="next" value="tank">Continue to first tank</button>
		<button class="skip" name="next" value="skip">Skip, I'll add a tank later</button>
	</div>
</form>

<style>
	.wrap {
		min-height: 100dvh;
		max-width: 480px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		padding-top: env(safe-area-inset-top);
	}
	.head {
		padding: 16px 24px 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.progress {
		display: flex;
		gap: 6px;
	}
	.progress i {
		height: 4px;
		flex: 1;
		border-radius: 2px;
		background: var(--border);
	}
	.progress i.on {
		background: var(--accent);
	}
	.step {
		font-size: 13px;
		color: var(--text-muted);
		margin-top: 10px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	.body {
		flex: 1;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 22px;
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
	.tz {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 16px;
		padding-right: 8px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
	}
	.foot {
		padding: 0 24px calc(40px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.skip {
		font-size: 15px;
		color: var(--text-muted);
		min-height: 44px;
	}
	@media (min-width: 1024px) {
		.wrap {
			justify-content: center;
			max-width: 520px;
		}
		.body,
		.foot {
			flex: none;
		}
	}
</style>
