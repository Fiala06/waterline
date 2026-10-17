<script lang="ts">
	// A plan (#177): "Day 3 of 19", its steps with where each stands, what it held back,
	// End early and Extend.
	import DateField from '$lib/components/DateField.svelte';
	import { addDays } from '$lib/time';
	import { untrack } from 'svelte';
	let { data } = $props();
	let until = $state(untrack(() => addDays(data.run.endsOn, 7)));
</script>

<svelte:head><title>{data.run.name} · {data.tank.name}</title></svelte:head>

<div class="page">
	<div class="bar hide-desk">
		<a class="cancel" href="/tanks/{data.tank.id}/plans">Plans</a>
		<h1>{data.run.name}</h1>
		<span aria-hidden="true"></span>
	</div>
	<div class="body">
		<p class="status"><b>{data.run.status}</b> · {data.run.started} to {data.run.ends}</p>

		<section aria-label="Steps">
			<h2 class="kicker rule">Steps</h2>
			{#each data.steps as s (s.id)}
				<a class="row" href="/tasks/{s.id}"
					><span class="name">{s.name}{#if s.ends}{" "}<small class="muted">· to {s.ends}</small>{/if}</span><span class="when status-{s.level}">{s.when}</span></a
				>
			{/each}
		</section>

		{#if data.held.length}
			<section aria-label="Held back">
				<h2 class="kicker rule">Held back</h2>
				{#each data.held as h (h.id)}
					<div class="row"><span class="name">{h.name}</span><span class="when plain">{h.until ? `‖ Paused until ${h.until}` : 'Back on'}</span></div>
				{/each}
			</section>
		{/if}

		{#if !data.run.endedAt}
			<section aria-label="Change the plan" class="acts">
				<form method="POST" action="?/extend" class="extend">
					<div class="field grow">
						<label class="label" for="plan-until">Run it to</label>
						<DateField name="until" id="plan-until" bind:value={until} label="Run it to" format="weekday" min={addDays(data.run.endsOn, 1)} today={data.today} />
					</div>
					<button class="btn">Extend</button>
				</form>
				<form method="POST" action="?/end">
					<button class="btn end">End early</button>
				</form>
				<small class="muted">Ending early closes its steps and brings back what it held back. To pause it, use <a href="/tanks/{data.tank.id}/pause?from=/tanks/{data.tank.id}/plans/{data.run.id}">Pause tasks</a>.</small>
			</section>
		{/if}
	</div>
</div>

<style>
	.page {
		max-width: 640px;
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
		gap: 24px;
	}
	.status {
		margin: 0;
		font-size: 15px;
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
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		min-height: 52px;
		padding: 8px 0;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	.name {
		font-weight: 600;
		min-width: 0;
	}
	.when {
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.when.plain,
	.when.status-ok {
		color: var(--text-muted);
	}
	.acts {
		gap: 12px;
	}
	.extend {
		display: flex;
		align-items: flex-end;
		gap: 8px;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.end {
		width: 100%;
		color: var(--accent-text);
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
