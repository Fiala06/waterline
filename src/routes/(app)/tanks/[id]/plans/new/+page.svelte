<script lang="ts">
	// Start a plan (#177): the steps, each to keep or leave out, rename and re-time,
	// with the dates it works out to, then the routines to hold back. Works without scripts.
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { planDays, stepText } from '$lib/plans';
	import { addDays, fmtDate } from '$lib/time';

	let { data, form } = $props();
	let steps = $state(untrack(() => data.template.steps.map((s) => ({ ...s, keep: true }))));
	let busy = $state(false);
	const kept = $derived(steps.filter((s) => s.keep));
	const days = $derived(kept.length ? planDays(kept) : 0);
</script>

<svelte:head><title>{data.template.name} · {data.tank.name}</title></svelte:head>

<form
	method="POST"
	class="page"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<input type="hidden" name="t" value={data.template.key} />
	{#if data.entry}<input type="hidden" name="entry" value={data.entry} />{/if}
	<div class="bar hide-desk">
		<a class="cancel" href="/tanks/{data.tank.id}/plans">Cancel</a>
		<h1>{data.template.name}</h1>
		<span aria-hidden="true"></span>
	</div>

	<div class="body">
		{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}
		<p class="lead">{data.template.lead}</p>

		<div class="field">
			<label class="label" for="plan-name">Name</label>
			<input class="input" id="plan-name" name="planName" value={data.template.name} maxlength="80" />
		</div>

		<section aria-label="Steps">
			<h2 class="kicker rule">Steps · from today{days ? `, ${days} days to ${fmtDate(addDays(data.today, days - 1))}` : ''}</h2>
			{#each steps as s, i (i)}
				<div class="step" class:off={!s.keep}>
					<label class="check-row"><input type="checkbox" name="keep" value={i} bind:checked={s.keep} aria-label="Keep {s.name}" /></label>
					<div class="step-body">
						<input class="input" name="name" bind:value={s.name} maxlength="80" aria-label="Step {i + 1}" />
						<div class="days">
							<label>Day <input class="input num" type="number" min="1" name="from" inputmode="numeric" bind:value={s.from} aria-label="First day of step {i + 1}" /></label>
							<label>to <input class="input num" type="number" min="1" name="to" inputmode="numeric" bind:value={s.to} aria-label="Last day of step {i + 1}" /></label>
							<label>every <input class="input num" type="number" min="1" name="every" inputmode="numeric" bind:value={s.every} aria-label="Every how many days, step {i + 1}" /> days</label>
						</div>
						<small class="muted">{s.from >= 1 && s.to >= s.from && s.every >= 1 ? stepText(s, data.today) : 'Days from 1, the last on or after the first'}</small>
					</div>
				</div>
			{/each}
		</section>

		{#if data.routines.length}
			<section aria-label="Hold back">
				<h2 class="kicker rule">Hold back</h2>
				{#each data.routines as r (r.id)}
					<label class="check-row line"><input type="checkbox" name="pause" value={r.id} checked={r.checked} />{r.name}</label>
				{/each}
				<label class="pause-days"
					>for the first <input class="input num" type="number" min="0" name="pauseDays" inputmode="numeric" value={data.template.pause?.days ?? 0} aria-label="Days to hold back" /> days</label
				>
				<small class="muted">Paused tasks aren't due and send no reminders, then pick up again. 0 holds nothing back.</small>
			</section>
		{:else}
			<input type="hidden" name="pauseDays" value="0" />
		{/if}

		<p class="source">From {data.template.source}. A starting point: the label of whatever you dose, and the tank, come first.</p>
		<button class="btn btn-primary btn-lg" disabled={busy || !kept.length}>{busy ? 'Starting…' : `Start ${data.template.name.toLowerCase()}`}</button>
	</div>
</form>

<style>
	.page {
		max-width: 640px;
		display: flex;
		flex-direction: column;
	}
	.bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 8px 20px;
	}
	.cancel {
		font-size: 15px;
		color: var(--text-muted);
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-self: start;
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
	}
	.body {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.lead,
	.source {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
	}
	.source {
		font-size: 13px;
		color: var(--text-muted);
	}
	section {
		display: flex;
		flex-direction: column;
	}
	.rule {
		margin: 0;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
	}
	.step {
		display: flex;
		gap: 12px;
		padding: 12px 0;
		border-bottom: 1px solid var(--divider);
	}
	.step.off .step-body {
		opacity: 0.5;
	}
	.step-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.days {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 14px;
		font-size: 14px;
	}
	.days label,
	.pause-days {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.num {
		width: 64px;
		text-align: center;
	}
	.line {
		border-bottom: 1px solid var(--divider);
	}
	.pause-days {
		padding: 10px 0 4px;
		font-size: 14px;
	}
	@media (min-width: 1024px) {
		.page {
			max-width: 880px;
			padding: 24px 32px 48px;
		}
		.body {
			padding: 0;
			max-width: 640px;
		}
	}
</style>
