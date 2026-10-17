<script lang="ts">
	// Create-a-tank form (setup step 2 and Tanks › Add tank). With `cancelHref`
	// (Add tank) it becomes a card with Cancel + Create on desktop.
	import { enhance } from '$app/forms';
	let {
		volUnit,
		errors = {},
		values = {},
		submitLabel = 'Create tank',
		cancelHref
	}: {
		volUnit: string;
		errors?: Record<string, string>;
		values?: Record<string, string>;
		submitLabel?: string;
		cancelHref?: string;
	} = $props();

	const types = [
		{ value: 'freshwater', label: 'Freshwater' },
		{ value: 'planted', label: 'Planted' },
		{ value: 'brackish', label: 'Brackish' },
		{ value: 'reef', label: 'Reef' }
	];
	// a planted tank (#81): how it's grown decides which parameters it starts with
	const styles = [
		{ value: 'low_tech', label: 'Low-tech', text: 'No injected CO₂: easy plants, moderate light.' },
		{ value: 'co2', label: 'CO₂ injected', text: 'CO₂, the plant nutrients and KH are tracked from the start.' },
		{ value: 'simple', label: 'Not sure', text: 'Keep it simple: the basics now, more whenever you like.' }
	];
	const waters = [
		{ value: 'tap', label: 'Tap' },
		{ value: 'rodi', label: 'RO/RODI' },
		{ value: 'mix', label: 'Mixed' },
		{ value: 'well', label: 'Well' },
		{ value: '', label: 'Not sure' }
	];
	let busy = $state(false);
</script>

<form
	method="POST"
	class="tank-form"
	class:paged={!!cancelHref}
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update();
			busy = false;
		};
	}}
>
	<div class="body">
		<div class="field">
			<label class="label" for="name">Tank name</label>
			<input
				class="input"
				id="name"
				name="name"
				defaultValue={values.name ?? ''}
				required
				maxlength="80"
				placeholder="e.g. Riverbed 40"
				aria-invalid={!!errors.name}
			/>
			{#if errors.name}<span class="error-text">✕ {errors.name}</span>{/if}
		</div>
		<fieldset class="field">
			<legend class="label">Type</legend>
			<div class="options two">
				{#each types as t (t.value)}
					<label class="option">
						<input type="radio" name="type" value={t.value} defaultChecked={(values.type ?? 'freshwater') === t.value} />{t.label}
					</label>
				{/each}
			</div>
			{#if errors.type}<span class="error-text">✕ {errors.type}</span>{/if}
		</fieldset>
		<!-- shown for a planted tank (hidden by CSS otherwise, so it works without JavaScript) -->
		<fieldset class="field planted-only">
			<legend class="label">How is it grown?</legend>
			<div class="options styles">
				{#each styles as s (s.value)}
					<label class="option style">
						<input type="radio" name="growingStyle" value={s.value} defaultChecked={(values.growingStyle ?? 'simple') === s.value} />
						<span class="style-name">{s.label}</span>
						<span class="style-text">{s.text}</span>
					</label>
				{/each}
			</div>
		</fieldset>
		<fieldset class="field planted-only">
			<legend class="label">Water</legend>
			<div class="options waters">
				{#each waters as w (w.value)}
					<label class="option">
						<input type="radio" name="waterSource" value={w.value} defaultChecked={(values.waterSource ?? '') === w.value} />{w.label}
					</label>
				{/each}
			</div>
		</fieldset>
		<div class="field">
			<label class="label" for="nominalVolume">Volume</label>
			<div class="unit-input">
				<input id="nominalVolume" name="nominalVolume" inputmode="decimal" defaultValue={values.nominalVolume ?? ''} placeholder="—" />
				<span class="unit">{volUnit}</span>
			</div>
			{#if errors.nominalVolume}<span class="error-text">✕ {errors.nominalVolume}</span>{/if}
		</div>
		<label class="check-row cycling">
			<input type="checkbox" name="cycling" defaultChecked={values.cycling === 'on'} />
			<span>This tank is still cycling</span>
		</label>
		<p class="hint">
			Default parameters and a weekly water-change reminder are added. You can change them later in tank settings.
		</p>
		<p class="hint planted-only">
			Low-tech and Not sure leave CO₂, potassium, iron, TDS and conductivity off; turn any of them on in Parameters &amp; targets.
		</p>
	</div>
	<div class="foot">
		{#if cancelHref}<a class="btn cancel" href={cancelHref}>Cancel</a>{/if}
		<button class="btn btn-primary btn-lg" disabled={busy}>{submitLabel}</button>
	</div>
</form>

<style>
	.tank-form {
		flex: 1;
		display: flex;
		flex-direction: column;
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
	.two {
		grid-template-columns: 1fr 1fr;
	}
	/* a planted tank's questions: hidden for other types (shown where :has isn't supported) */
	.tank-form:has(input[name='type']:checked):not(:has(input[name='type'][value='planted']:checked)) .planted-only {
		display: none;
	}
	.styles {
		grid-template-columns: 1fr;
	}
	.option.style {
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 2px;
		padding: 10px 14px;
		text-align: left;
	}
	.style-text {
		font-size: 13px;
		font-weight: 400;
		line-height: 1.4;
	}
	.waters {
		grid-template-columns: repeat(3, 1fr);
	}
	.hint {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.cycling {
		font-size: 14px;
		font-weight: 600;
	}
	.foot {
		padding: 0 24px calc(32px + env(safe-area-inset-bottom));
	}
	.cancel {
		display: none;
	}
	/* Add tank on desktop: a flat form under the shell's title, 2px rule above the footer */
	@media (min-width: 1024px) {
		.paged {
			flex: none;
			width: 100%;
			max-width: 640px;
			padding: 24px 32px 40px;
		}
		.paged .body {
			padding: 0;
		}
		.paged .two {
			grid-template-columns: repeat(4, 1fr);
		}
		.paged .styles {
			grid-template-columns: repeat(3, 1fr);
		}
		.paged .waters {
			grid-template-columns: repeat(5, 1fr);
		}
		.paged .foot {
			margin-top: 20px;
			padding: 16px 0 0;
			border-top: 2px solid var(--divider);
			display: flex;
			flex-direction: row-reverse;
			justify-content: flex-start;
			gap: 12px;
		}
		.paged .cancel {
			display: inline-flex;
			border: none;
			color: var(--text-muted);
		}
		.paged .foot .btn {
			width: auto;
			height: 44px;
			font-size: 14px;
		}
		.paged .btn-primary {
			padding: 0 22px;
		}
	}
</style>
