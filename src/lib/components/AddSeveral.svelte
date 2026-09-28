<script lang="ts">
	// Add several livestock or plants at once: search the species list, tick as
	// many as you like, set each one's count (or where a plant goes), and add
	// them together. Without scripts, a list typed one per line does the same.
	import { enhance } from '$app/forms';
	import { onMount, untrack } from 'svelte';
	import DateField from './DateField.svelte';

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
	let q = $state('');
	let results = $state<Species[]>([]);
	let searching = $state(false);
	let picked = $state<Picked[]>([]);
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
	function addTyped() {
		const name = q.trim().slice(0, 80);
		if (!name) return;
		const key = `custom:${name.toLowerCase()}`;
		if (!isPicked(key)) picked.push({ key, name, scientific: null, kind: 'fish', custom: true, count: 1, position: 'midground' });
		q = '';
		results = [];
	}
	const exact = $derived(results.some((r) => [r.s, ...r.c].some((n) => n.toLowerCase() === q.trim().toLowerCase())));

	const row = (p: Picked) =>
		JSON.stringify(
			plants
				? { name: p.name, scientific: p.scientific, position: p.position, status: 'thriving' }
				: { kind: p.kind, name: p.name, scientific: p.scientific, count: Math.max(1, Math.round(Number(p.count) || 1)) }
		);
	const animals = $derived(picked.reduce((n, p) => n + Math.max(1, Math.round(Number(p.count) || 1)), 0));
	const saveLabel = $derived(
		!js
			? 'Add them'
			: plants
				? `Add ${picked.length || ''} plant${picked.length === 1 ? '' : 's'}`.replace('  ', ' ')
				: picked.length
					? `Add ${animals} animal${animals === 1 ? '' : 's'} · ${picked.length} species`
					: 'Add species'
	);
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
		<button class="save-top" disabled={busy || (js && !picked.length)}>Add</button>
	</div>
	<div class="body">
		{#if error}<p class="banner banner-bad" role="alert">✕ {error}</p>{/if}

		{#if js}
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
					placeholder={plants ? 'e.g. Java fern, Monte Carlo' : 'e.g. Neon tetra, Amano shrimp'}
					aria-describedby="several-hint"
				/>
				<span id="several-hint" class="hint">Tick as many as you like; each gets its own {plants ? 'place' : 'count'} below.</span>
			</div>

			{#if results.length || (q.trim().length >= 2 && !searching)}
				<ul class="card results" aria-label="Matches">
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
								<span class="r-text"><span class="r-name">Add “{q.trim()}”</span><span class="r-sci">Not in the species list: a name of your own</span></span>
							</button>
						</li>
					{/if}
				</ul>
			{/if}

			<section class="picked" aria-labelledby="picked-h">
				<h2 id="picked-h" class="caps">{picked.length ? `Adding · ${picked.length}` : 'Nothing picked yet'}</h2>
				{#if picked.length}
					<ul class="card list">
						{#each picked as p, i (p.key)}
							<li>
								<input type="hidden" name="row" value={row(p)} />
								<div class="p-text">
									<span class="p-name">{p.name}</span>
									{#if p.scientific && p.scientific !== p.name}<span class="p-sci">{p.scientific}</span>{/if}
									{#if !plants && p.custom}
										<select class="kind" bind:value={p.kind} aria-label="{p.name}: fish, invert or coral">
											{#each KINDS as k (k.value)}<option value={k.value}>{k.label}</option>{/each}
										</select>
									{/if}
								</div>
								{#if plants}
									<select class="input pos" bind:value={p.position} aria-label="Where {p.name} goes">
										{#each POSITIONS as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
									</select>
								{:else}
									<div class="count-stepper">
										<button type="button" aria-label="Fewer {p.name}" disabled={Number(p.count) <= 1} onclick={() => (p.count = Math.max(1, Number(p.count) - 1))}>−</button>
										<input inputmode="numeric" bind:value={p.count} aria-label="How many {p.name}" />
										<button type="button" aria-label="More {p.name}" onclick={() => (p.count = (Number(p.count) || 0) + 1)}>+</button>
									</div>
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
			<!-- without scripts: a typed list -->
			<div class="field">
				<label class="label" for="several-lines">{plants ? 'Plants, one per line' : 'Species, one per line, with how many'}</label>
				<textarea class="input" id="several-lines" name="lines" rows="6" placeholder={plants ? 'Java fern\nMonte Carlo' : '6 Neon tetra\n3 Amano shrimp'}></textarea>
			</div>
		{/if}

		<div class="field">
			<label class="label" for="several-added">Added</label>
			<DateField name="addedAt" id="several-added" bind:value={addedAt} label="Added" {today} max={today} required />
		</div>
		{#if !plants}
			<fieldset class="field">
				<legend class="label">Status</legend>
				<div class="segmented">
					<label><input type="radio" name="status" value="in_tank" defaultChecked />In tank</label>
					<label><input type="radio" name="status" value="quarantine" />Quarantine</label>
				</div>
			</fieldset>
			<div class="field">
				<label class="label" for="several-source">Source · optional</label>
				<input class="input" id="several-source" name="source" maxlength="120" placeholder="Store, breeder, price" />
			</div>
		{/if}

		<p class="hint">
			Each is added to History, and adding one that's already in the tank adds to its count. Undo takes them all back.
		</p>
	</div>
	<div class="foot">
		<a class="btn hide-phone" href={back}>Cancel</a>
		<button class="btn btn-primary add" disabled={busy || (js && !picked.length)}>{saveLabel}</button>
	</div>
</form>

<style>
	.lform {
		max-width: 560px;
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
		font-weight: 600;
	}
	.save-top {
		justify-self: end;
		color: var(--accent);
		font-weight: 700;
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
		gap: 18px;
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
	textarea.input {
		height: auto;
		padding: 12px 14px;
		line-height: 1.5;
	}
	/* matches, each a toggle */
	.results {
		margin: -8px 0 0;
		padding: 0;
		list-style: none;
		overflow: hidden;
	}
	.results li + li {
		border-top: 1px solid var(--border);
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
		background: var(--selected);
	}
	@media (hover: hover) {
		.res:hover {
			background: var(--surface-hi);
		}
	}
	.tick {
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		border: 1px solid var(--border-strong);
		font-weight: 700;
		color: var(--accent);
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
		font-size: 13px;
		font-style: italic;
		color: var(--text-muted);
	}
	.picked {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.picked h2 {
		margin: 0;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.list li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 8px 8px 14px;
		min-height: 60px;
	}
	.list li + li {
		border-top: 1px solid var(--border);
	}
	.kind {
		align-self: flex-start;
		margin-top: 2px;
		min-height: 32px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: 13px;
		padding: 0 6px;
	}
	.count-stepper {
		display: flex;
		width: 128px;
		flex-shrink: 0;
		height: 44px;
		padding: 0 2px;
		background: var(--surface-2);
		border-color: var(--border);
	}
	.count-stepper input {
		flex: 1;
		align-self: stretch;
		width: 0;
		font-size: 16px;
		font-weight: 700;
	}
	.count-stepper button {
		font-size: 20px;
		color: var(--text-2);
		border-radius: 10px;
	}
	.count-stepper button:disabled {
		color: var(--placeholder);
	}
	.pos {
		width: 150px;
		flex-shrink: 0;
		height: 44px;
	}
	.remove {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		border-radius: 10px;
		color: var(--text-muted);
	}
	@media (hover: hover) {
		.remove:hover {
			background: var(--surface-hi);
			color: var(--text);
		}
	}
	.none {
		margin: 0;
		font-size: 14px;
		color: var(--text-faint);
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
		line-height: 1.5;
	}
	.foot {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		gap: 12px;
	}
	.add {
		flex: 1;
		height: 56px;
		border-radius: 14px;
		font-size: 17px;
	}
	@media (min-width: 1024px) {
		.lform {
			min-height: 0;
			max-width: 680px;
			margin: 28px auto;
			padding: 24px 28px;
			background: var(--surface);
			border: 1px solid var(--border);
			border-radius: 20px;
		}
		.body {
			padding: 0;
		}
		.lform :global(.input) {
			background-color: var(--surface-2);
			border-color: var(--border-strong);
		}
		.segmented {
			background: var(--surface-2);
		}
		.results,
		.list {
			background: var(--surface-2);
		}
		.foot {
			margin-top: 24px;
			padding: 20px 0 0;
			border-top: 1px solid var(--border);
			justify-content: flex-end;
		}
		.foot .btn {
			height: 44px;
		}
		.add {
			flex: none;
			padding: 0 22px;
			border-radius: 12px;
			font-size: 15px;
		}
	}
</style>
