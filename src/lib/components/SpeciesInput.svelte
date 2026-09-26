<script lang="ts">
	// T5 · Species autocomplete from the bundled list; custom names always allowed.
	import { untrack } from 'svelte';

	interface Species {
		s: string;
		c: string[];
		kind: string;
		water: string;
	}
	let {
		id = 'species',
		kind = null,
		water = null,
		initialName = '',
		initialScientific = '',
		invalid = false,
		label = 'Species'
	}: {
		id?: string;
		kind?: string | null;
		water?: 'fresh' | 'marine' | null;
		initialName?: string;
		initialScientific?: string;
		invalid?: boolean;
		label?: string;
	} = $props();

	let text = $state(untrack(() => initialName));
	let scientific = $state(untrack(() => initialScientific));
	let results = $state<Species[]>([]);
	let open = $state(false);
	let active = $state(-1);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let seq = 0;

	function search(q: string) {
		clearTimeout(timer);
		if (q.trim().length < 2) {
			results = [];
			return;
		}
		timer = setTimeout(async () => {
			const my = ++seq;
			const params = new URLSearchParams({ q });
			if (kind) params.set('kind', kind);
			if (water) params.set('water', water);
			try {
				const r = await fetch(`/api/species?${params}`);
				if (my === seq && r.ok) results = await r.json();
			} catch {
				/* offline: custom name still works */
			}
		}, 150);
	}

	function oninput() {
		scientific = '';
		open = true;
		active = -1;
		search(text);
	}

	function pick(s: Species | null) {
		if (s) {
			text = s.c[0] ?? s.s;
			scientific = s.s;
		}
		open = false;
		results = [];
	}

	function onkeydown(e: KeyboardEvent) {
		if (!open || !results.length) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = (active + 1) % (results.length + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = (active - 1 + results.length + 1) % (results.length + 1);
		} else if (e.key === 'Enter' && active >= 0) {
			e.preventDefault();
			pick(active < results.length ? results[active] : null);
		} else if (e.key === 'Escape') {
			open = false;
		}
	}
</script>

<div class="field species">
	<label class="label" for={id}>{label}</label>
	<input
		class="input"
		{id}
		name="name"
		bind:value={text}
		{oninput}
		{onkeydown}
		onblur={() => setTimeout(() => (open = false), 150)}
		autocomplete="off"
		maxlength="80"
		required
		role="combobox"
		aria-expanded={open && results.length > 0}
		aria-controls="{id}-list"
		aria-autocomplete="list"
		aria-invalid={invalid}
		placeholder="Start typing, e.g. ember"
	/>
	<input type="hidden" name="scientificName" value={scientific} />
	{#if scientific}<span class="sci">{scientific}</span>{/if}
	{#if open && results.length}
		<ul class="list card" id="{id}-list" role="listbox">
			{#each results as r, i (r.s)}
				<li role="option" aria-selected={active === i}>
					<button type="button" class:active={active === i} onmousedown={(e) => e.preventDefault()} onclick={() => pick(r)}>
						<span class="c">{r.c[0] ?? r.s}</span>
						<span class="s">{r.s}</span>
					</button>
				</li>
			{/each}
			<li role="option" aria-selected={active === results.length}>
				<button type="button" class="custom" class:active={active === results.length} onmousedown={(e) => e.preventDefault()} onclick={() => pick(null)}>
					Use “{text}” as a custom name
				</button>
			</li>
		</ul>
	{/if}
</div>

<style>
	.species {
		position: relative;
	}
	.sci {
		font-size: 13px;
		font-style: italic;
		color: var(--text-muted);
	}
	.list {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 10;
		margin: 4px 0 0;
		padding: 4px;
		list-style: none;
		box-shadow: var(--shadow-modal);
		border-color: var(--border-strong);
		max-height: 320px;
		overflow-y: auto;
	}
	.list button {
		width: 100%;
		text-align: left;
		padding: 10px 12px;
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: 44px;
	}
	.list button:hover,
	.list button.active {
		background: var(--surface-hi);
	}
	.c {
		font-size: 15px;
		font-weight: 600;
	}
	.s {
		font-size: 13px;
		font-style: italic;
		color: var(--text-muted);
	}
	.custom {
		font-size: 14px;
		color: var(--accent);
		font-weight: 600;
	}
</style>
