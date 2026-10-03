<script lang="ts">
	// First run (redesign README § 17): the welcome, your name, units and time
	// zone, then on to the first tank. The four steps that follow are laid out
	// under the form.
	import { untrack } from 'svelte';
	import { onMount } from 'svelte';
	import Logo from '$lib/components/Logo.svelte';
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
	const STEPS = [
		{ n: '01', t: 'Add a tank', d: 'Its name, type and volume. A photo can come later.' },
		{ n: '02', t: 'Set targets', d: 'The ranges you aim for. Presets fit most planted, reef and shrimp tanks.' },
		{ n: '03', t: 'Log the first test', d: 'Each reading is flagged as you type: ✓ in range, ▲ near, ✕ out.' },
		{ n: '04', t: 'Set a reminder', d: 'Water changes, tests and dosing, on a schedule that nudges you.' }
	];
</script>

<svelte:head><title>Set up · Waterline</title></svelte:head>

<div class="screen">
	<div class="wrap">
		<form method="POST" class="welcome">
			<div class="head">
				<span class="brand"><Logo size={28} wordmark wordSize={18} /></span>
				<span class="kicker">Welcome · step 1 of 2</span>
				<h1>Keep every tank on track.</h1>
				<p class="lede">Water tests, water changes and maintenance for every tank you keep, flagged the moment something drifts. First, how you measure things.</p>
			</div>

			<div class="body">
				{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}
				<div class="field name">
					<label class="label" for="displayName">Display name</label>
					<input class="input" id="displayName" name="displayName" defaultValue={data.displayName} required autocomplete="name" />
				</div>

				<div class="units">
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
							<label><input type="radio" name="hardnessUnit" value="dgh" defaultChecked={data.hardnessUnit === 'dgh'} />dGH / dKH</label>
							<label><input type="radio" name="hardnessUnit" value="ppm" defaultChecked={data.hardnessUnit === 'ppm'} />ppm</label>
						</div>
					</fieldset>
				</div>

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
				<p class="hint">{unitSystem === 'metric' ? 'Metric: L · °C · cm.' : 'Imperial: gal · °F · in.'} You can change these later in Settings.</p>
			</div>

			<div class="foot">
				<button class="btn btn-primary btn-lg go" name="next" value="tank">Continue to first tank</button>
				<button class="btn-text skip" name="next" value="skip">Skip, I'll add a tank later</button>
			</div>
		</form>

		<!-- what comes next: four steps under a 2px ink rule -->
		<ol class="steps" aria-label="What comes next">
			{#each STEPS as s (s.n)}
				<li>
					<span class="sn">{s.n}</span>
					<span class="st">{s.t}</span>
					<span class="sd">{s.d}</span>
				</li>
			{/each}
		</ol>
	</div>
</div>

<style>
	.screen {
		min-height: 100dvh;
		padding: env(safe-area-inset-top) 0 calc(24px + env(safe-area-inset-bottom));
	}
	.wrap {
		max-width: 1040px;
		margin: 0 auto;
		padding: 24px 20px 0;
		display: flex;
		flex-direction: column;
		gap: 36px;
	}
	.welcome {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.brand {
		display: inline-flex;
		margin-bottom: 14px;
	}
	h1 {
		margin: 0;
		font-size: 36px;
		line-height: 1;
		letter-spacing: -0.02em;
	}
	.lede {
		margin: 0;
		font-size: 16px;
		line-height: 1.5;
		max-width: 620px;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding-top: 18px;
		border-top: 2px solid var(--ink);
	}
	.units {
		display: contents;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 6px;
	}
	.tz {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 16px;
		padding-right: 6px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	.foot {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.skip {
		align-self: center;
		color: var(--text-muted);
	}
	/* the steps: numbered columns, 1px lines between */
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: 1fr;
		border-top: 2px solid var(--ink);
	}
	.steps li {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 14px 0;
		border-bottom: 1px solid var(--divider);
	}
	.sn {
		font-size: 13px;
		font-weight: 800;
		color: var(--accent-700);
	}
	.st {
		font-size: 17px;
		font-weight: 800;
	}
	.sd {
		font-size: 14px;
		line-height: 1.45;
		color: var(--text-2);
	}

	@media (min-width: 1024px) {
		.wrap {
			padding: 64px 48px 0;
		}
		h1 {
			font-size: 56px;
		}
		.lede {
			font-size: 18px;
		}
		.body {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 18px 24px;
		}
		.name {
			grid-column: 1 / -1;
			max-width: 440px;
		}
		.units {
			display: contents;
		}
		.hint {
			grid-column: 1 / -1;
		}
		.segmented label {
			min-height: 44px;
			font-size: 15px;
		}
		.foot {
			flex-direction: row;
			align-items: center;
			gap: 16px;
		}
		.go {
			width: auto;
			padding: 0 24px;
		}
		.skip {
			align-self: auto;
		}
		.steps {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.steps li {
			padding: 16px 20px 20px 0;
			border-bottom: none;
		}
		.steps li + li {
			padding-left: 20px;
			border-left: 1px solid var(--divider);
		}
	}
</style>
