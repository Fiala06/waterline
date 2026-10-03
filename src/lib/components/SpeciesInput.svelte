<script lang="ts">
	// T5 · Species autocomplete from the bundled list; custom names always allowed.
	import { untrack } from 'svelte';
	import type { DraftRestoreEvent } from '$lib/draft';

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

	// An unsaved log entry coming back (lib/draft): keep the picked species, no suggestions.
	let field: HTMLInputElement | undefined = $state();
	$effect(() => {
		if (!field) return;
		const restore = (e: Event) => {
			const { value, fields } = (e as DraftRestoreEvent).detail;
			e.preventDefault();
			text = value;
			scientific = fields.get('scientificName')?.[0] ?? '';
		};
		field.addEventListener('draftrestore', restore);
		return () => field?.removeEventListener('draftrestore', restore);
	});
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

	// T5: the typed part of each name in bold ("**Ember** tetra")
	function parts(name: string) {
		const q = text.trim();
		const i = q ? name.toLowerCase().indexOf(q.toLowerCase()) : -1;
		return i < 0 ? [name, '', ''] : [name.slice(0, i), name.slice(i, i + q.length), name.slice(i + q.length)];
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
		bind:this={field}
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
		placeholder={kind === 'plant' ? 'Start typing, e.g. java fern' : 'Start typing, e.g. ember'}
	/>
	<input type="hidden" name="scientificName" value={scientific} />
	{#if scientific}<span class="sci">{scientific}</span>{/if}
	{#if open && results.length}
		<ul class="list" id="{id}-list" role="listbox">
			{#each results as r, i (r.s)}
				{@const [pre, hit, post] = parts(r.c[0] ?? r.s)}
				<li role="option" aria-selected={active === i}>
					<button type="button" class:active={active === i} onmousedown={(e) => e.preventDefault()} onclick={() => pick(r)}>
						<span class="c">{pre}<strong>{hit}</strong>{post}</span>
						<span class="s">{r.s}</span>
					</button>
				</li>
			{/each}
			<li role="option" aria-selected={active === results.length}>
				<button type="button" class="custom" class:active={active === results.length} onmousedown={(e) => e.preventDefault()} onclick={() => pick(null)}>
					Use "{text}" as a custom name
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
	/* T5 */
	.list {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 10;
		margin: 6px 0 0;
		padding: 0;
		list-style: none;
		background: var(--bg);
		border: 2px solid var(--ink);
		box-shadow: var(--shadow-lg);
		max-height: 320px;
		overflow-y: auto;
	}
	.list li + li {
		border-top: 1px solid var(--divider);
	}
	.list button {
		width: 100%;
		text-align: left;
		padding: 10px 14px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: 44px;
	}
	.list button:hover,
	.list button.active {
		background: var(--surface);
	}
	.c {
		font-size: 15px;
	}
	.c strong {
		font-weight: 700;
	}
	.s {
		font-size: 12px;
		font-style: italic;
		color: var(--text-muted);
	}
	.custom {
		font-size: 14px;
		color: var(--accent-text);
		font-weight: 800;
	}
</style>
