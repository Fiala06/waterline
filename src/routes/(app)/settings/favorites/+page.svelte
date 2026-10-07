<script lang="ts">
	// Quick log favorites (#93): the keeper's usual entries, pinned on Quick add
	// (and in ⌘K). Each opens its log form filled in; nothing is saved until
	// they save. For one tank or every tank; in the order kept here.
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { DOSING_UNITS, MAINTENANCE_ACTIONS, WATER_SOURCES } from '$lib/events';
	import { FAVORITE_KIND_LABEL, FAVORITE_KINDS } from '$lib/favorites';
	let { data, form } = $props();

	// the favorite whose form is open: after a refused save, from ?edit= without scripts, or picked here
	let editing = $state<string | null>(untrack(() => form?.edit?.id ?? data.edit ?? null));
	const blank = { label: '', tank: '', kind: 'water_change', amountMode: 'percent', amount: '', source: 'tap', product: '', unit: '', food: '', actions: [] as string[] };
	type Vals = typeof blank;
	const addErr = $derived<Record<string, string>>(form?.add?.errors ?? {});
	const addVal = $derived<Vals>(form?.add?.values ?? blank);
	const editErr = $derived<Record<string, string>>(form?.edit?.errors ?? {});
</script>

<svelte:head><title>Quick log favorites · Settings · Waterline</title></svelte:head>

{#snippet fields(prefix: string, v: Vals, err: Record<string, string>)}
	<!-- the kind first: the fields below follow it (CSS :has, so it works without scripts) -->
	<fieldset class="field">
		<legend class="label">Logs</legend>
		<div class="chips" role="radiogroup" aria-label="What it logs">
			{#each FAVORITE_KINDS as k (k)}
				<label class="chip pick"><input type="radio" name="kind" value={k} checked={v.kind === k} />{FAVORITE_KIND_LABEL[k]}</label>
			{/each}
		</div>
		{#if err.kind}<span class="error-text">✕ {err.kind}</span>{/if}
	</fieldset>

	<div class="kind-fields for-water_change">
		<fieldset class="field">
			<legend class="label">Amount · optional</legend>
			<div class="inline">
				<input class="input num" name="wcAmount" inputmode="decimal" value={v.amount} autocomplete="off" placeholder="40" aria-label="Amount" aria-invalid={!!err.amount} />
				<div class="segmented" role="radiogroup" aria-label="Percent or volume">
					<label><input type="radio" name="amountMode" value="percent" checked={v.amountMode !== 'volume'} />%</label>
					<label><input type="radio" name="amountMode" value="volume" checked={v.amountMode === 'volume'} />{data.volUnit}</label>
				</div>
			</div>
			{#if err.amount}<span class="error-text">✕ {err.amount}</span>{/if}
		</fieldset>
		<fieldset class="field">
			<legend class="label">Source water</legend>
			<div class="chips" role="radiogroup" aria-label="Source water">
				{#each WATER_SOURCES as s (s.value)}
					<label class="chip pick"><input type="radio" name="source" value={s.value} checked={v.source === s.value} />{s.label}</label>
				{/each}
			</div>
		</fieldset>
	</div>

	<div class="kind-fields for-dosing">
		<div class="field">
			<label class="label" for="{prefix}-product">Product</label>
			<input class="input" id="{prefix}-product" name="product" maxlength="80" value={v.product} autocomplete="off" placeholder="e.g. Thrive" aria-invalid={!!err.product} />
			{#if err.product}<span class="error-text">✕ {err.product}</span>{/if}
		</div>
		<fieldset class="field">
			<legend class="label">Amount · optional</legend>
			<div class="inline">
				<input class="input num" name="doseAmount" inputmode="decimal" value={v.amount} autocomplete="off" placeholder="5" aria-label="Amount" aria-invalid={!!err.amount} />
				<select class="input unit" name="doseUnit" aria-label="Unit">
					{#each DOSING_UNITS as u (u)}<option value={u} selected={(v.unit || 'mL') === u}>{u}</option>{/each}
				</select>
			</div>
			{#if err.amount}<span class="error-text">✕ {err.amount}</span>{/if}
		</fieldset>
	</div>

	<div class="kind-fields for-feeding">
		<div class="field">
			<label class="label" for="{prefix}-food">Food · optional</label>
			<input class="input" id="{prefix}-food" name="food" maxlength="80" value={v.food} autocomplete="off" placeholder="e.g. Frozen bloodworms" />
		</div>
		<fieldset class="field">
			<legend class="label">Amount · optional</legend>
			<div class="inline">
				<input class="input num" name="feedAmount" inputmode="decimal" value={v.amount} autocomplete="off" placeholder="1" aria-label="Amount" aria-invalid={!!err.amount} />
				<input class="input unit" name="feedUnit" maxlength="20" value={v.unit} autocomplete="off" placeholder="cubes, pinches" aria-label="Unit" />
			</div>
			{#if err.amount}<span class="error-text">✕ {err.amount}</span>{/if}
		</fieldset>
	</div>

	<fieldset class="field kind-fields for-maintenance">
		<legend class="label">Done · optional</legend>
		<div class="chips">
			{#each MAINTENANCE_ACTIONS as a (a)}
				<label class="chip pick"><input type="checkbox" name="actions" value={a} checked={v.actions.includes(a)} />{a}</label>
			{/each}
		</div>
	</fieldset>

	<div class="two">
		<div class="field">
			<label class="label" for="{prefix}-label">Name · optional</label>
			<input class="input" id="{prefix}-label" name="label" maxlength="60" value={v.label} autocomplete="off" placeholder="Named from the fields if blank" />
		</div>
		<div class="field">
			<label class="label" for="{prefix}-tank">Tank</label>
			<select class="input" id="{prefix}-tank" name="tank" aria-invalid={!!err.tank}>
				<option value="" selected={!v.tank}>Every tank</option>
				{#each data.tanks as t (t.id)}<option value={t.id} selected={v.tank === t.id}>{t.name}</option>{/each}
			</select>
			{#if err.tank}<span class="error-text">✕ {err.tank}</span>{/if}
		</div>
	</div>
{/snippet}

<div class="page sub-page">
	<div class="head">
		<a class="back sub-back" href="/settings">‹ Settings</a>
		<div class="title-row">
			<h1>Quick log favorites</h1>
			<a class="btn btn-primary" href="#add">+ Add favorite</a>
		</div>
		<p class="lede">Your usual entries, one tap from Log (and in ⌘K). Each opens its form filled in; nothing is saved until you save it.</p>
	</div>

	{#if data.favorites.length}
		<ul class="list" aria-label="Favorites">
			{#each data.favorites as f (f.id)}
				<li>
					<div class="item">
						<CategoryIcon kind={f.kind} size={36} />
						<div class="t">
							<span class="name">{f.label}</span>
							<span class="meta">{[f.kindLabel, f.sub, f.tankName].filter(Boolean).join(' · ')}</span>
						</div>
						<div class="acts">
							<form method="POST" action="?/move" use:enhance class="move">
								<input type="hidden" name="id" value={f.id} />
								<button class="btn-text arrow" name="dir" value="up" disabled={f.first} aria-label="Move {f.label} up">↑</button>
								<button class="btn-text arrow" name="dir" value="down" disabled={f.last} aria-label="Move {f.label} down">↓</button>
							</form>
							<a
								class="btn-text edit-link"
								href="?edit={f.id}"
								aria-expanded={editing === f.id}
								onclick={(e) => {
									e.preventDefault();
									editing = editing === f.id ? null : f.id;
								}}>Edit<span class="sr-only"> {f.label}</span></a
							>
						</div>
					</div>
					{#if editing === f.id}
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
							<input type="hidden" name="id" value={f.id} />
							{@render fields(`e-${f.id}`, form?.edit?.id === f.id ? form.edit.values : f, form?.edit?.id === f.id ? editErr : {})}
							<div class="edit-acts">
								<button class="btn btn-danger del" formaction="?/delete">Remove</button>
								<a class="btn" href="/settings/favorites" onclick={(e) => (e.preventDefault(), (editing = null))}>Cancel</a>
								<button class="btn btn-primary">Save</button>
							</div>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<EmptyState compact icon="water_change" title="No favorites yet" text="Pin what you log most, like a 40% water change or your fertilizer dose, and it's one tap from Log." />
	{/if}

	{#if data.suggestions.length}
		<section class="suggest" aria-labelledby="suggest-h">
			<h2 id="suggest-h">From your routines</h2>
			<ul class="list">
				{#each data.suggestions as s (`${s.tankId}:${s.kind}:${s.label}`)}
					<li>
						<form method="POST" action="?/add" use:enhance class="item">
							{#each Object.entries(s.inputs) as [k, v] (k)}<input type="hidden" name={k} value={v} />{/each}
							<div class="t">
								<span class="name">{s.label}</span>
								<span class="meta">{s.tank}</span>
							</div>
							<button class="btn">Pin<span class="sr-only"> {s.label} for {s.tank}</span></button>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<form
		method="POST"
		action="?/add"
		class="add"
		id="add"
		use:enhance={({ formElement }) =>
			async ({ result, update }) => {
				await update();
				// pinned: empty the fields for the next one (the page stays, so they'd keep what was typed)
				if (result.type === 'redirect') for (const el of formElement.querySelectorAll('input:not([type=radio]):not([type=checkbox])')) (el as HTMLInputElement).value = '';
			}}
	>
		<h2>Add a favorite</h2>
		{@render fields('add', addVal, addErr)}
		<button class="btn btn-primary go">Add favorite</button>
	</form>
</div>

<style>
	.page {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 20px;
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
	.lede {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		max-width: 620px;
	}
	/* the list: a 2px ink rule, then a row per favorite */
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
		min-width: 160px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: 15px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.meta {
		font-size: 12px;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.acts {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.move {
		display: flex;
	}
	.arrow {
		min-width: 44px;
		color: var(--text-muted);
	}
	.arrow:disabled {
		opacity: 0.35;
	}
	.edit-link {
		color: var(--text-muted);
	}
	.edit {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 4px 0 16px;
	}
	.edit-acts {
		display: flex;
		gap: 10px;
	}
	.edit-acts .btn-primary {
		flex: 1;
	}
	.del {
		margin-right: auto;
	}
	.suggest {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.suggest .btn {
		min-height: 44px;
	}

	/* adding: the same fields, under a rule of their own */
	.add {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding-top: 14px;
		border-top: 2px solid var(--ink);
		scroll-margin-top: 16px;
	}
	h2 {
		margin: 0;
		font-size: 17px;
	}
	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.inline {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.num {
		width: 96px;
	}
	.unit {
		width: 140px;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr;
		gap: 14px;
	}
	/* the fields follow the kind picked above; a browser without :has shows them all */
	.kind-fields {
		display: none;
		flex-direction: column;
		gap: 14px;
	}
	form:has(input[name='kind'][value='water_change']:checked) .for-water_change,
	form:has(input[name='kind'][value='dosing']:checked) .for-dosing,
	form:has(input[name='kind'][value='feeding']:checked) .for-feeding,
	form:has(input[name='kind'][value='maintenance']:checked) .for-maintenance {
		display: flex;
	}
	@supports not selector(:has(a)) {
		.kind-fields {
			display: flex;
		}
	}
	.go {
		min-height: 48px;
	}

	@media (hover: hover) {
		.edit-link:hover,
		.arrow:not(:disabled):hover {
			color: var(--accent-text);
		}
	}
	@media (min-width: 640px) {
		.two {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (min-width: 1024px) {
		.page {
			gap: 22px;
		}
		h1 {
			font-size: 22px;
		}
		.go {
			align-self: flex-start;
			min-height: 44px;
			padding: 0 22px;
		}
		.edit-acts .btn-primary {
			flex: none;
			padding: 0 22px;
		}
	}
</style>
