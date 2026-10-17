<script lang="ts">
	// Maintenance routines (#92): each a named sequence of log steps, built a
	// step at a time (or from a Quick log favorite), with ↑ ↓ and Remove, and
	// Run to walk through it. Works without scripts: Add a step is a link.
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import LogStepFields, { BLANK_STEP } from '$lib/components/LogStepFields.svelte';
	let { data, form } = $props();

	// the routine whose Add a step form is open: after a refused save, from ?add= without scripts, or picked here
	let adding = $state<string | null>(untrack(() => form?.step?.id ?? data.open ?? null));
	// after Add routine (or a step) the address names the routine to keep adding to
	$effect(() => {
		if (data.open) adding = data.open;
	});
	let renaming = $state<string | null>(untrack(() => form?.rename?.id ?? null));
	const stepErr = $derived<Record<string, string>>(form?.step?.errors ?? {});
	const stepVal = $derived(form?.step?.values ?? BLANK_STEP);
</script>

<svelte:head><title>Maintenance routines · {data.tank.name}</title></svelte:head>

<div class="page sub-page">
	<div class="phead hide-desk">
		<a class="back sub-back" href="/tanks/{data.tank.id}">‹ {data.tank.name}</a>
		<h1 class="title">Maintenance routines</h1>
	</div>
	<p class="lede">A routine is your usual sequence, like Sunday maintenance: a water change, a dose, a trim, a test. Running one walks you through the steps; each one you log is an ordinary entry in History, and any step can be skipped.</p>

	{#if data.routines.length}
		{#each data.routines as r (r.id)}
			<section class="routine" id="r-{r.id}" aria-labelledby="rh-{r.id}">
				<div class="section-head">
					{#if renaming === r.id}
						<form method="POST" action="?/rename" class="rename" use:enhance={() => async ({ result, update }) => { if (result.type === 'redirect') renaming = null; await update(); }}>
							<input type="hidden" name="id" value={r.id} />
							<input class="input" name="name" value={r.name} maxlength="60" aria-label="Routine name" aria-invalid={form?.rename?.id === r.id && !!form.rename.error} />
							<button class="btn btn-primary">Save</button>
							<button type="button" class="btn" onclick={() => (renaming = null)}>Cancel</button>
						</form>
					{:else}
						<h2 id="rh-{r.id}">{r.name} <span class="meta">· {r.steps.length} step{r.steps.length === 1 ? '' : 's'}</span></h2>
						<span class="head-acts">
							<button type="button" class="btn-text" onclick={() => (renaming = r.id)}>Rename<span class="sr-only"> {r.name}</span></button>
							{#if r.steps.length}<a class="btn btn-primary run" href="/tanks/{data.tank.id}/routines/{r.id}/run">Run<span class="sr-only"> {r.name}</span> ›</a>{/if}
						</span>
					{/if}
				</div>
				{#if form?.rename?.id === r.id && form.rename.error}<span class="error-text">✕ {form.rename.error}</span>{/if}
				{#if r.steps.length}
					<ol class="steps" aria-label="Steps of {r.name}">
						{#each r.steps as s (s.i)}
							<li>
								<span class="n">{s.i + 1}</span>
								<CategoryIcon kind={s.kind} size={32} />
								<span class="s-text">
									<span class="s-label">{s.label}</span>
									<span class="s-sub">{[s.kindLabel, s.sub].filter(Boolean).join(' · ')}</span>
								</span>
								<form method="POST" class="s-acts" use:enhance>
									<input type="hidden" name="id" value={r.id} />
									<input type="hidden" name="index" value={s.i} />
									<button class="btn-text arrow" formaction="?/moveStep" name="dir" value="up" disabled={s.first} aria-label="Move step {s.i + 1} up">↑</button>
									<button class="btn-text arrow" formaction="?/moveStep" name="dir" value="down" disabled={s.last} aria-label="Move step {s.i + 1} down">↓</button>
									<button class="btn-text remove" formaction="?/removeStep">Remove<span class="sr-only"> step {s.i + 1}, {s.label}</span></button>
								</form>
							</li>
						{/each}
					</ol>
				{:else}
					<p class="hint none">No steps yet. Add the first below.</p>
				{/if}
				<div class="acts">
					<a class="btn" href="?add={r.id}#r-{r.id}" aria-expanded={adding === r.id} onclick={(e) => { e.preventDefault(); adding = adding === r.id ? null : r.id; }}>+ Add a step<span class="sr-only"> to {r.name}</span></a>
					<form method="POST" action="?/delete" use:enhance class="del">
						<input type="hidden" name="id" value={r.id} />
						<button class="btn-text danger">Delete<span class="sr-only"> {r.name}</span></button>
					</form>
				</div>
				{#if adding === r.id}
					<div class="add-step">
						{#if data.favorites.length}
							<div class="from-favs">
								<span class="label">From your favorites</span>
								<div class="chips">
									{#each data.favorites as f (f.id)}
										<form method="POST" action="?/addFavorite" use:enhance>
											<input type="hidden" name="id" value={r.id} />
											<input type="hidden" name="favorite" value={f.id} />
											<button class="chip">+ {f.label}</button>
										</form>
									{/each}
								</div>
							</div>
						{/if}
						<form method="POST" action="?/addStep" class="step-form" use:enhance={() => async ({ result, update }) => { await update(); if (result.type === 'redirect') adding = r.id; }}>
							<input type="hidden" name="id" value={r.id} />
							<span class="label">Or a step of your own</span>
							<LogStepFields prefix="s-{r.id}" v={form?.step?.id === r.id && form.step.values ? form.step.values : BLANK_STEP} err={form?.step?.id === r.id ? stepErr : {}} volUnit={data.volUnit} />
							<div class="step-acts">
								<button type="button" class="btn" onclick={() => (adding = null)}>Done adding</button>
								<button class="btn btn-primary">Add step</button>
							</div>
						</form>
					</div>
				{/if}
			</section>
		{/each}
	{:else}
		<EmptyState compact icon="maintenance" title="No routines yet" text="Name your usual sequence, then add its steps: a water change, a dose, a trim, a test." />
	{/if}

	<form method="POST" action="?/add" class="add" id="add" use:enhance>
		<h2>Add a routine</h2>
		<div class="field">
			<label class="label" for="new-name">Name</label>
			<input class="input" id="new-name" name="name" maxlength="60" autocomplete="off" placeholder="e.g. Sunday maintenance" aria-invalid={!!form?.add?.error} />
			{#if form?.add?.error}<span class="error-text">✕ {form.add.error}</span>{/if}
		</div>
		<button class="btn btn-primary go">Add routine</button>
	</form>
</div>

<style>
	.page {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 22px;
		max-width: 820px;
	}
	.phead {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.title {
		margin: 0;
		font-size: 28px;
	}
	.lede {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		max-width: 620px;
	}
	.routine {
		display: flex;
		flex-direction: column;
		gap: 10px;
		scroll-margin-top: 16px;
	}
	.head-acts {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.run {
		min-height: 36px;
		padding: 0 14px;
	}
	.rename {
		flex: 1;
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.rename .input {
		flex: 1;
		min-width: 0;
	}
	/* the steps: numbered rows with 1px dividers */
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.steps li {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 6px 0;
		border-bottom: 1px solid var(--divider);
	}
	.n {
		width: 20px;
		font-size: 13px;
		font-weight: 800;
		color: var(--text-muted);
		text-align: right;
	}
	.s-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.s-label {
		font-size: 15px;
		font-weight: 600;
	}
	.s-sub {
		font-size: 12px;
		color: var(--text-muted);
	}
	.s-acts {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}
	.arrow {
		min-width: 40px;
		color: var(--text-muted);
	}
	.arrow:disabled {
		opacity: 0.35;
	}
	.remove {
		color: var(--text-muted);
	}
	.none {
		margin: 0;
	}
	.acts {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.danger {
		color: var(--bad);
	}
	.add-step {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 14px 0 6px;
		border-top: 1px solid var(--divider);
	}
	.from-favs {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.step-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.step-acts {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}
	.add {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding-top: 14px;
		border-top: 2px solid var(--ink);
	}
	.add h2 {
		margin: 0;
		font-size: 17px;
	}
	.go {
		min-height: 48px;
	}
	@media (hover: hover) {
		.remove:hover,
		.arrow:not(:disabled):hover {
			color: var(--accent-text);
		}
	}
	@media (min-width: 1024px) {
		.title {
			font-size: 22px;
		}
		.go {
			align-self: flex-start;
			min-height: 44px;
			padding: 0 22px;
		}
	}
</style>
