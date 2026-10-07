<script lang="ts">
	// Add several livestock or plants at once (README → Screens §6, Add several):
	// "One per row" searches the species list and lists what's picked as rows with
	// a − n + stepper and a type select; "Paste a list" takes `6 Neon tetra`,
	// `Otocinclus x 5` or `Amano shrimp, 3` and shows how each line was read.
	// Without scripts, the typed list alone does the same (the server parses it).
	import { enhance } from '$app/forms';
	import { onMount, untrack } from 'svelte';
	import DateField from './DateField.svelte';
	import { parseSeveralList, severalSaveLabel } from '$lib/several';

	type Kind = 'fish' | 'invert' | 'coral';
	type Position = 'background' | 'midground' | 'foreground' | 'epiphyte' | 'floating';
	interface Species {
		s: string;
		c: string[];
		kind: string;
		water: string;
	}
	interface Picked {
		key: string;
		name: string;
		scientific: string | null;
		kind: Kind;
		custom: boolean;
		count: number;
		position: Position;
	}
	let {
		list,
		tank,
		water,
		today,
		error = ''
	}: {
		list: 'livestock' | 'plants';
		tank: { id: string; name: string };
		water: 'fresh' | 'marine' | null;
		today: string;
		error?: string;
	} = $props();

	const plants = $derived(list === 'plants');
	const back = $derived(`/tanks/${tank.id}/${list}`);
	const POSITIONS: { value: Position; label: string }[] = [
		{ value: 'background', label: 'Background' },
		{ value: 'midground', label: 'Midground' },
		{ value: 'foreground', label: 'Foreground' },
		{ value: 'epiphyte', label: 'Epiphyte' },
		{ value: 'floating', label: 'Floating' }
	];
	const KINDS: { value: Kind; label: string }[] = [
		{ value: 'fish', label: 'Fish' },
		{ value: 'invert', label: 'Invert' },
		{ value: 'coral', label: 'Coral' }
	];

	let js = $state(false);
	onMount(() => (js = true));
	let mode = $state<'rows' | 'paste'>('rows');
	let q = $state('');
	let results = $state<Species[]>([]);
	let searching = $state(false);
	let picked = $state<Picked[]>([]);
	let paste = $state('');
	let addedAt = $state(untrack(() => today));
	let timer: ReturnType<typeof setTimeout> | undefined;
	let seq = 0;

	function search() {
		clearTimeout(timer);
		if (q.trim().length < 2) {
			results = [];
			return;
		}
		timer = setTimeout(async () => {
			const my = ++seq;
			const params = new URLSearchParams({ q, kind: plants ? 'plant' : 'animal', many: '1' });
			if (water) params.set('water', water);
			searching = true;
			try {
				const r = await fetch(`/api/species?${params}`);
				if (my === seq && r.ok) results = await r.json();
			} catch {
				/* offline: a typed name still works */
			} finally {
				if (my === seq) searching = false;
			}
		}, 150);
	}

	const keyOf = (s: Species) => s.s;
	const isPicked = (key: string) => picked.some((p) => p.key === key);
	function toggle(s: Species) {
		const key = keyOf(s);
		if (isPicked(key)) picked = picked.filter((p) => p.key !== key);
		else
			picked.push({
				key,
				name: s.c[0] ?? s.s,
				scientific: s.s,
				kind: s.kind === 'invert' || s.kind === 'coral' ? s.kind : 'fish',
				custom: false,
				count: 1,
				position: 'midground'
			});
	}
	function addCustom(name: string, count = 1) {
		const key = `custom:${name.toLowerCase()}`;
		if (!isPicked(key)) picked.push({ key, name, scientific: null, kind: 'fish', custom: true, count, position: 'midground' });
	}
	function addTyped() {
		const name = q.trim().slice(0, 80);
		if (!name) return;
		addCustom(name);
		q = '';
		results = [];
	}
	const exact = $derived(results.some((r) => [r.s, ...r.c].some((n) => n.toLowerCase() === q.trim().toLowerCase())));

	// Paste a list: how each line reads (`6 Neon tetra`, `Otocinclus x 5`, `Amano shrimp, 3`), as the server reads it too
	const parsed = $derived(parseSeveralList(paste));
	// from the preview into rows, each one a name of your own (the datalist can still match it)
	function toRows() {
		for (const p of parsed) addCustom(p.name, p.count);
		paste = '';
		mode = 'rows';
	}

	const row = (p: Picked) =>
		JSON.stringify(
			plants
				? { name: p.name, scientific: p.scientific, position: p.position, status: 'thriving' }
				: { kind: p.kind, name: p.name, scientific: p.scientific, count: Math.max(1, Math.round(Number(p.count) || 1)) }
		);
	const usingPaste = $derived(js && mode === 'paste');
	const items = $derived(usingPaste ? parsed.length : picked.length);
	const animals = $derived(
		usingPaste ? parsed.reduce((n, p) => n + p.count, 0) : picked.reduce((n, p) => n + Math.max(1, Math.round(Number(p.count) || 1)), 0)
	);
	const saveLabel = $derived(severalSaveLabel(js, plants, items, animals));
	let busy = $state(false);
</script>

<form
	method="POST"
	class="lform"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update();
			busy = false;
		};
	}}
>
	<!-- phones; on desktop the header has the title -->
	<div class="bar hide-desk">
		<a class="cancel" href={back}>Cancel</a>
		<h1>{plants ? 'Add several plants' : 'Add several'}</h1>
		<button class="save-top" disabled={busy || (js && !items)}>Add</button>
	</div>
	<div class="body">
		{#if error}<p class="banner banner-bad" role="alert">✕ {error}</p>{/if}

		{#if js}
			<div class="segmented modes" role="group" aria-label="How to add them">
				<label><input type="radio" name="mode" value="rows" bind:group={mode} />One per row</label>
				<label><input type="radio" name="mode" value="paste" bind:group={mode} />Paste a list</label>
			</div>
		{/if}

		{#if js && mode === 'rows'}
			<div class="field">
				<label class="label" for="several-q">{plants ? 'Search plants' : 'Search species'}</label>
				<input
					class="input"
					id="several-q"
					type="search"
					bind:value={q}
					oninput={search}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							if (results.length === 1) toggle(results[0]);
							else if (!results.length) addTyped();
						}
					}}
					autocomplete="off"
					placeholder="Search species, or type your own"
					aria-describedby="several-hint"
				/>
				<span id="several-hint" class="hint">Tick as many as you like; each gets its own {plants ? 'place' : 'count'} below.</span>
			</div>

			{#if results.length || (q.trim().length >= 2 && !searching)}
				<ul class="results" aria-label="Matches">
					{#each results as s (s.s)}
						{@const on = isPicked(keyOf(s))}
						<li>
							<button type="button" class="res" aria-pressed={on} onclick={() => toggle(s)}>
								<span class="tick" aria-hidden="true">{on ? '✓' : '+'}</span>
								<span class="r-text"><span class="r-name">{s.c[0] ?? s.s}</span>{#if s.c.length}<span class="r-sci">{s.s}</span>{/if}</span>
							</button>
						</li>
					{/each}
					{#if q.trim().length >= 2 && !exact}
						<li>
							<button type="button" class="res" onclick={addTyped}>
								<span class="tick" aria-hidden="true">+</span>
								<span class="r-text"><span class="r-name">Add “{q.trim()}”</span><span class="r-sci plain">Your own name · no care ranges</span></span>
							</button>
						</li>
					{/if}
				</ul>
			{/if}

			<section class="picked" aria-labelledby="picked-h">
				<div class="thead" class:plants>
					<h2 id="picked-h" class="kicker">{picked.length ? `Adding · ${picked.length}` : 'Nothing picked yet'}</h2>
					{#if picked.length}<span class="kicker">{plants ? 'Where' : 'How many'}</span><span class="kicker">{plants ? '' : 'Type'}</span><span></span>{/if}
				</div>
				{#if picked.length}
					<ul class="list">
						{#each picked as p, i (p.key)}
							<li class="prow" class:plants>
								<input type="hidden" name="row" value={row(p)} />
								<div class="p-text">
									<span class="p-name">{p.name}</span>
									<span class="p-sci" class:plain={!p.scientific || p.scientific === p.name}>
										{p.scientific && p.scientific !== p.name ? p.scientific : 'Your own name · no care ranges'}
									</span>
								</div>
								{#if plants}
									<select class="input pos" bind:value={p.position} aria-label="Where {p.name} goes">
										{#each POSITIONS as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
									</select>
								{:else}
									<div class="stepper">
										<button type="button" aria-label="Fewer {p.name}" disabled={Number(p.count) <= 1} onclick={() => (p.count = Math.max(1, Number(p.count) - 1))}>−</button>
										<input inputmode="numeric" bind:value={p.count} aria-label="How many {p.name}" />
										<button type="button" aria-label="More {p.name}" onclick={() => (p.count = (Number(p.count) || 0) + 1)}>+</button>
									</div>
									<select class="input kind" bind:value={p.kind} aria-label="{p.name}: fish, invert or coral">
										{#each KINDS as k (k.value)}<option value={k.value}>{k.label}</option>{/each}
									</select>
								{/if}
								<button type="button" class="remove" aria-label="Take {p.name} off the list" onclick={() => picked.splice(i, 1)}>✕</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="none">Search above and tick what's in the tank.</p>
				{/if}
			</section>
		{:else}
			<!-- a typed list: the only way without scripts, "Paste a list" with them -->
			<div class="field">
				<label class="label" for="several-lines">{plants ? 'Plants, one per line' : 'Species, one per line, with how many'}</label>
				<textarea
					class="input lines"
					id="several-lines"
					name="lines"
					rows="5"
					bind:value={paste}
					placeholder={plants ? 'Java fern\nMonte Carlo' : '6 Harlequin rasbora\nOtocinclus x 5\nAmano shrimp, 3'}
				></textarea>
			</div>
			{#if js && parsed.length}
				<div class="read">
					<span class="kicker rule">Read as</span>
					{#each parsed as p, i (i)}
						<div class="read-row" class:plants>
							{#if !plants}<span class="read-n">{p.count} ×</span>{/if}
							<span class="read-name">{p.name}</span>
						</div>
					{/each}
				</div>
				<button type="button" class="ghost edit-rows" onclick={toRows}>Edit as rows ›</button>
			{/if}
		{/if}

		<div class="shared">
			<div class="field">
				<label class="label" for="several-added">Added</label>
				<DateField name="addedAt" id="several-added" bind:value={addedAt} label="Added" {today} max={today} required />
			</div>
			{#if !plants}
				<fieldset class="field">
					<legend class="label">Where · all of them</legend>
					<div class="segmented where">
						<label><input type="radio" name="status" value="in_tank" defaultChecked />In tank</label>
						<label><input type="radio" name="status" value="quarantine" />Quarantine</label>
					</div>
				</fieldset>
				<div class="field from">
					<label class="label" for="several-source">From (optional)</label>
					<input class="input" id="several-source" name="source" maxlength="120" placeholder="e.g. local fish store" />
				</div>
			{/if}
		</div>

		<p class="hint">▲ Each is added to History, and adding one that's already in the tank adds to its count. Undo takes them all back.</p>
	</div>
	<div class="foot">
		<button class="btn btn-primary add" disabled={busy || (js && !items)}>{saveLabel}<span class="key hide-phone" aria-hidden="true">⌘↵</span></button>
		<a class="ghost hide-phone" href={back}>Cancel</a>
	</div>
</form>

<style>
	.lform {
		max-width: 760px;
		min-height: 100dvh;
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
	.save-top {
		justify-self: end;
		color: var(--accent-text);
		font-weight: 800;
		font-size: 16px;
		min-height: 44px;
	}
	.save-top:disabled {
		opacity: 0.45;
	}
	.body {
		flex: 1;
		padding: 8px 20px 12px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.modes {
		align-self: flex-start;
	}
	.modes label {
		padding: 0 16px;
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
	.ghost {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 8px;
		font-size: 14px;
		font-weight: 800;
		color: var(--accent-text);
		white-space: nowrap;
	}
	.lines {
		font-family: ui-monospace, Menlo, monospace;
		font-size: 13px;
		line-height: 1.6;
	}
	/* matches, each a toggle */
	.results {
		margin: -8px 0 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--divider);
	}
	.results li + li {
		border-top: 1px solid var(--divider);
	}
	.res {
		width: 100%;
		min-height: 52px;
		padding: 8px 14px;
		display: flex;
		align-items: center;
		gap: 12px;
		text-align: left;
	}
	.res[aria-pressed='true'] {
		background: var(--surface);
	}
	.tick {
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--divider);
		font-weight: 800;
		color: var(--accent-text);
	}
	.res[aria-pressed='true'] .tick {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}
	.r-text,
	.p-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.r-name,
	.p-name {
		font-size: 15px;
		font-weight: 600;
		color: var(--text);
	}
	.r-sci,
	.p-sci {
		font-size: 12px;
		font-style: italic;
		color: var(--text-muted);
	}
	.r-sci.plain,
	.p-sci.plain {
		font-style: normal;
	}
	/* the picked rows: Species · How many · Type · remove, under a 2px rule */
	.picked {
		display: flex;
		flex-direction: column;
	}
	.thead {
		display: flex;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
	}
	.thead h2 {
		margin: 0;
		font-weight: 400;
	}
	.thead .kicker:not(h2),
	.thead > span {
		display: none;
	}
	.list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.prow {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas: 'text remove' 'ctl ctl';
		align-items: center;
		gap: 8px 10px;
		padding: 10px 0;
		border-bottom: 1px solid var(--divider);
	}
	.p-text {
		grid-area: text;
	}
	.stepper,
	.kind,
	.pos {
		grid-area: ctl;
	}
	.prow:not(.plants) .stepper {
		grid-area: auto;
	}
	.prow:not(.plants) {
		grid-template-areas: 'text remove' 'step kind';
		grid-template-columns: minmax(0, 1fr) auto;
	}
	.prow:not(.plants) .stepper {
		grid-area: step;
		justify-self: start;
	}
	.prow:not(.plants) .kind {
		grid-area: kind;
	}
	.remove {
		grid-area: remove;
	}
	.kind,
	.pos {
		height: 44px;
	}
	.kind {
		width: 150px;
	}
	/* − n + : three boxes in a row */
	.stepper {
		display: grid;
		grid-template-columns: 40px 52px 40px;
		height: 44px;
	}
	.stepper button {
		border: 1px solid var(--divider);
		font-size: 18px;
		color: var(--text);
	}
	.stepper button:first-child {
		border-right: none;
	}
	.stepper button:last-child {
		border-left: none;
	}
	.stepper button:disabled {
		color: var(--placeholder);
	}
	.stepper input {
		width: 100%;
		height: 100%;
		border: 1px solid var(--divider);
		background: var(--surface);
		text-align: center;
		font-size: 16px;
		font-weight: 800;
		padding: 0;
		outline: none;
	}
	.stepper input:focus {
		border-color: var(--accent);
	}
	.remove {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		color: var(--text-muted);
		font-size: 15px;
	}
	.none {
		margin: 0;
		padding: 12px 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	/* Paste a list: how each line was read */
	.read {
		display: flex;
		flex-direction: column;
	}
	.rule {
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
	}
	.read-row {
		display: grid;
		grid-template-columns: 48px minmax(0, 1fr);
		gap: 10px;
		align-items: baseline;
		padding: 7px 0;
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
	}
	.read-row.plants {
		grid-template-columns: minmax(0, 1fr);
	}
	.read-n {
		font-weight: 800;
	}
	.read-name {
		font-weight: 600;
	}
	.edit-rows {
		align-self: flex-start;
		margin-top: -8px;
		padding: 0 4px;
	}
	/* shared fields, past a 2px rule: Added · Where · From */
	.shared {
		display: grid;
		gap: 14px;
		padding-top: 14px;
		border-top: 2px solid var(--divider);
	}
	.where label {
		padding: 0 16px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.foot {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		gap: 10px;
	}
	.add {
		flex: 1;
		height: 52px;
		font-size: 16px;
		justify-content: space-between;
	}
	.add .key {
		font-weight: 400;
		opacity: 0.85;
	}
	@media (hover: hover) {
		.res:hover,
		.stepper button:not(:disabled):hover,
		.remove:hover {
			background: color-mix(in srgb, var(--text) 7%, transparent);
		}
		.ghost:hover {
			background: color-mix(in srgb, var(--accent) 10%, transparent);
		}
	}
	@media (min-width: 1024px) {
		.lform {
			min-height: 0;
			padding: 24px 32px 40px;
		}
		.body {
			padding: 0;
		}
		.thead,
		.prow,
		.prow:not(.plants) {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 132px 150px 36px;
			grid-template-areas: none;
			gap: 10px;
		}
		.thead .kicker:not(h2),
		.thead > span {
			display: block;
		}
		.thead.plants {
			grid-template-columns: minmax(0, 1fr) 150px 36px;
		}
		.thead.plants > span:nth-child(3) {
			display: none;
		}
		.prow.plants {
			grid-template-columns: minmax(0, 1fr) 150px 36px;
		}
		.p-text,
		.stepper,
		.prow:not(.plants) .stepper,
		.prow:not(.plants) .kind,
		.kind,
		.pos,
		.remove {
			grid-area: auto;
		}
		.stepper {
			grid-template-columns: 36px minmax(0, 1fr) 36px;
			height: 40px;
		}
		.kind,
		.pos {
			width: auto;
			height: 40px;
		}
		.remove {
			width: 36px;
			height: 40px;
		}
		.shared {
			grid-template-columns: auto minmax(0, 1fr);
			gap: 12px 20px;
			align-items: end;
		}
		.shared > .field:first-child {
			grid-column: 1 / -1;
			max-width: 240px;
		}
		.foot {
			margin-top: 8px;
			padding: 0;
		}
		.add {
			height: 44px;
			font-size: 14px;
		}
	}
</style>
