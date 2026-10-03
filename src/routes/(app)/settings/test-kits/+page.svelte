<script lang="ts">
	// Settings › Test kits (#21): a kit for each parameter, its steps one per line
	// with the waits read off the end ("Wait 5 min"), presets to start from.
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	let { data, form } = $props();
	let editing = $state<string | null>(untrack(() => form?.edit?.id ?? data.edit ?? null));
	const addErr = $derived<Record<string, string>>(form?.add?.errors ?? {});
	const addVal = $derived(form?.add?.values ?? { name: data.prefill?.name ?? '', paramKey: data.prefill?.paramKey ?? 'no3', customName: '', stepsText: data.prefill?.stepsText ?? '' });
	const editErr = $derived<Record<string, string>>(form?.edit?.errors ?? {});
	type Vals = { name: string; paramKey: string; customName: string; stepsText: string };
	const splitKey = (k: string) => (k.startsWith('custom:') ? { paramKey: 'custom', customName: k.slice(7) } : { paramKey: k, customName: '' });
</script>

<svelte:head><title>Test kits · Settings · Waterline</title></svelte:head>

{#snippet fields(prefix: string, v: Vals, err: Record<string, string>)}
	<div class="pair">
		<div class="field">
			<label class="label" for="{prefix}-name">Kit</label>
			<input class="input" id="{prefix}-name" name="name" maxlength="80" value={v.name} autocomplete="off" placeholder="e.g. API Nitrate" aria-invalid={!!err.name} />
			{#if err.name}<span class="error-text">✕ {err.name}</span>{/if}
		</div>
		<div class="field">
			<label class="label" for="{prefix}-param">Tests</label>
			<select class="input" id="{prefix}-param" name="paramKey" value={v.paramKey} aria-invalid={!!err.paramKey}>
				{#each data.params as p (p.key)}<option value={p.key}>{p.name}</option>{/each}
				<option value="custom">A custom parameter…</option>
			</select>
			{#if err.paramKey}<span class="error-text">✕ {err.paramKey}</span>{/if}
		</div>
	</div>
	<div class="field custom-name">
		<label class="label" for="{prefix}-custom">Custom parameter's name</label>
		<input class="input" id="{prefix}-custom" name="customName" maxlength="60" value={v.customName} autocomplete="off" placeholder="As it's named in Parameters & targets" />
	</div>
	<div class="field">
		<label class="label" for="{prefix}-steps">Steps · one per line</label>
		<textarea class="input steps" id="{prefix}-steps" name="steps" rows="7" aria-invalid={!!err.steps} placeholder={'Fill the tube to 5 mL\nAdd 10 drops of bottle 1\nShake 30 s\nWait 5 min\nRead the colour'}>{v.stepsText}</textarea>
		<span class="hint">End a step with a time ("Shake 30 s", "Wait 5 min") and the form runs a timer for it.</span>
		{#if err.steps}<span class="error-text">✕ {err.steps}</span>{/if}
	</div>
{/snippet}

<div class="page sub-page">
	<div class="head">
		<a class="back sub-back" href="/settings">‹ Settings</a>
		<div class="title-row">
			<h1>Test kits</h1>
			<a class="btn btn-primary" href="#add">+ Add kit</a>
		</div>
		<p class="lede">The steps of each test, with its shakes and waits. On the water test form, Start beside the parameter runs them with a timer while you do the other readings, and chimes when time's up.</p>
	</div>

	{#if data.kits.length}
		<ul class="list">
			{#each data.kits as k (k.id)}
				<li>
					<div class="item">
						<div class="t">
							<span class="name">{k.name}<span class="tag tag-neutral">{k.param}</span>{#if k.takes}<span class="takes">{k.takes}</span>{/if}</span>
							<span class="meta">{k.line}</span>
						</div>
						<div class="acts">
							<a
								class="btn-text"
								href="?edit={k.id}"
								aria-expanded={editing === k.id}
								onclick={(e) => {
									e.preventDefault();
									editing = editing === k.id ? null : k.id;
								}}>Edit<span class="sr-only"> {k.name}</span></a
							>
						</div>
					</div>
					{#if editing === k.id}
						<form
							method="POST"
							action="?/update"
							class="edit"
							use:enhance={() =>
								async ({ result, update }) => {
									if (result.type === 'redirect') editing = null;
									await update();
								}}
						>
							<input type="hidden" name="id" value={k.id} />
							{@render fields(`e-${k.id}`, form?.edit?.id === k.id ? form.edit.values : { name: k.name, ...splitKey(k.paramKey), stepsText: k.stepsText }, form?.edit?.id === k.id ? editErr : {})}
							<div class="edit-acts">
								<button class="btn btn-danger del" formaction="?/delete">Delete</button>
								<a class="btn" href="/settings/test-kits" onclick={(e) => (e.preventDefault(), (editing = null))}>Cancel</a>
								<button class="btn btn-primary">Save</button>
							</div>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<EmptyState compact icon="test" title="No kits yet" text="Start from a preset below, or write your own kit's steps." />
	{/if}

	<section class="presets" aria-labelledby="presets-h">
		<h2 id="presets-h">Start from a preset</h2>
		<p class="hint">From the makers' leaflets; check them against the one in your box. Pick one and change what you like before saving.</p>
		<ul class="preset-list">
			{#each data.presets as p (p.id)}
				<li>
					<a class="preset" href="?preset={p.id}#add">
						<span class="p-name">{p.name}</span>
						<span class="p-meta">{p.maker} · {p.param}{p.takes ? ` · ${p.takes}` : ''}</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>

	<form
		method="POST"
		action="?/add"
		class="add"
		id="add"
		use:enhance={({ formElement }) =>
			async ({ result, update }) => {
				await update();
				if (result.type === 'redirect') for (const el of formElement.querySelectorAll('input, textarea')) (el as HTMLInputElement).value = '';
			}}
	>
		<h2>{data.prefill ? `Add ${data.prefill.name}` : 'Add a kit'}</h2>
		{#key data.prefill?.name}
			{@render fields('add', addVal, addErr)}
		{/key}
		<button class="btn btn-primary go">Add kit</button>
	</form>
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 820px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
	}
	h2 {
		margin: 0;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		font-size: 17px;
		font-weight: 800;
	}
	.lede {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
		max-width: 620px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 2px solid var(--ink);
	}
	.list li {
		border-bottom: 1px solid var(--divider);
	}
	.item {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 12px;
		padding: 10px 0;
	}
	.t {
		flex: 1;
		min-width: 200px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: 15px;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.tag {
		font-size: 10px;
	}
	.takes {
		font-size: 12px;
		font-weight: 400;
		color: var(--text-muted);
	}
	.meta {
		font-size: 12px;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.acts .btn-text {
		min-height: 44px;
		padding: 0;
		font-size: 14px;
	}
	.edit,
	.add {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.edit {
		padding: 4px 0 14px;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.field .input {
		min-height: 44px;
	}
	.steps {
		min-height: 160px;
		font-variant-numeric: tabular-nums;
		line-height: 1.5;
	}
	/* the custom parameter's name shows once "A custom parameter…" is picked */
	.custom-name {
		display: none;
	}
	.edit:has(select[name='paramKey'] option[value='custom']:checked) .custom-name,
	.add:has(select[name='paramKey'] option[value='custom']:checked) .custom-name {
		display: flex;
	}
	.edit-acts {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
	}
	.del {
		margin-right: auto;
	}
	.go {
		align-self: flex-start;
		min-height: 44px;
	}
	.presets {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.preset-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 8px;
	}
	.preset {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: 56px;
		padding: 8px 10px;
		border: 1px solid var(--divider);
		color: var(--text);
	}
	.p-name {
		font-weight: 700;
		font-size: 14px;
	}
	.p-meta {
		font-size: 12px;
		color: var(--text-muted);
	}
	@media (hover: hover) {
		.preset:hover {
			border-color: var(--accent);
		}
	}
	@media (max-width: 599px) {
		.pair {
			grid-template-columns: 1fr;
		}
	}
</style>
