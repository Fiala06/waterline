<script lang="ts">
	// 04 / D12 · Quick add. Defaults to the current tank and now; both changeable.
	// On phones the Log button is the only way in, so the three main kinds are
	// big rows and the rest (with Dosing) are tiles. On desktop it opens from
	// "More…" under Log water test ▾, which already lists Test, Water change,
	// Dose and Note, so only the other kinds and importing are shown.
	// Desktop keys: T water test, W water change, N note.
	import { goto } from '$app/navigation';
	import CategoryIcon from './CategoryIcon.svelte';
	import DateTimePicker from './DateTimePicker.svelte';
	import Sheet from './Sheet.svelte';
	import TankSwitcher from './TankSwitcher.svelte';
	import { whenLabel, type When } from '$lib/time';
	import type { DueInfo } from '$lib/tasks';
	import { favoriteHref, type FavoriteLike } from '$lib/favorites';

	interface TankSummary {
		id: string;
		name: string;
		type: string;
		volume: string | null;
		alerts: number;
	}
	let {
		open = $bindable(false),
		tanks,
		currentTankId,
		timeZone,
		lastTest,
		wcDue,
		favorites = [],
		routines = []
	}: {
		open?: boolean;
		tanks: TankSummary[];
		currentTankId: string | null;
		timeZone: string;
		lastTest: string;
		wcDue: DueInfo | null;
		/** Quick log favorites (#93): pinned entries, each opening its form filled in; for one tank or every tank */
		favorites?: (FavoriteLike & { id: string; label: string; tankId: string | null; sub: string | null })[];
		/** maintenance routines (#92) with steps, to run */
		routines?: { id: string; tankId: string; name: string; steps: number }[];
	} = $props();

	let tankId = $state<string | null>(null);
	let when = $state<When | null>(null);
	let pickingTank = $state(false);
	let pickingWhen = $state(false);

	$effect(() => {
		if (open) {
			tankId = currentTankId;
			when = null;
			openedAt = new Date();
		}
	});

	const tank = $derived(tanks.find((t) => t.id === tankId));
	// the favorites for the tank chosen here, and the ones for every tank
	const pinned = $derived(favorites.filter((f) => !f.tankId || f.tankId === tankId));
	const runnable = $derived(routines.filter((r) => r.tankId === tankId));

	function href(path: string, params: Record<string, string> = {}) {
		const q = new URLSearchParams(params);
		if (tankId) q.set('tank', tankId);
		if (when) {
			q.set('date', when.date);
			q.set('time', when.time);
		}
		return `${path}?${q}`;
	}

	// the other kinds, and importing: one grid of the same tiles, 3 across
	// (Dosing only on phones: the desktop's Log ▾ menu has it)
	const more = [
		{ category: 'dosing', label: 'Dosing', phone: true },
		{ category: 'feeding', label: 'Feeding' },
		{ category: 'maintenance', label: 'Maintenance' },
		{ category: 'livestock', label: 'Livestock / plants' },
		{ category: 'equipment', label: 'Equipment' },
		{ category: 'observation', label: 'Observation' },
		{ category: 'health', label: 'Health' },
		// a plant's health (#85) and algae (#86) have their own pages
		{ category: 'plant', label: 'Plant health', to: (t: string) => `/tanks/${t}/plants/health` },
		{ category: 'observation', label: 'Algae', to: (t: string) => `/tanks/${t}/algae` }
	] as const;

	// "Now · Sep 28, 8:14 AM": when the sheet opened, in the keeper's time zone
	let openedAt = $state(new Date());
	const nowLabel = $derived(
		`Now · ${openedAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone })}`
	);

	function onkeydown(e: KeyboardEvent) {
		if (!open || pickingTank || pickingWhen || e.metaKey || e.ctrlKey || e.altKey) return;
		const t = e.target as HTMLElement;
		if (t.closest('input, textarea, select')) return;
		const k = e.key.toLowerCase();
		const target =
			k === 't'
				? href('/entries/test/new')
				: k === 'w'
					? href('/entries/event/new', { category: 'water_change' })
					: k === 'n'
						? href('/entries/event/new', { category: 'note' })
						: null;
		if (target) {
			e.preventDefault();
			open = false;
			goto(target);
		}
	}
</script>

<svelte:window {onkeydown} />

<Sheet bind:open label="Quick add" width={560}>
	<div class="head">
		<h2>Quick add</h2>
		<button type="button" class="close hide-desk" onclick={() => (open = false)}>Cancel</button>
		<button type="button" class="close hide-phone" onclick={() => (open = false)}>Esc to close</button>
	</div>
	{#if !tank}
		<p class="muted">Add a tank first to start logging.</p>
		<a class="btn btn-primary btn-lg" href="/tanks/new" onclick={() => (open = false)}>Add tank</a>
	{:else}
		<div class="ctx">
			<button type="button" class="chip chip-pill" onclick={() => (pickingTank = true)}>
				{tank.name} <span class="caret">▾</span>
			</button>
			<button type="button" class="chip chip-pill when" onclick={() => (pickingWhen = true)}>
				{when ? whenLabel(when) : nowLabel} <span class="caret">▾</span>
			</button>
		</div>

		{#if pinned.length}
			<!-- Quick log favorites (#93): the keeper's usual entries, one tap to the form filled in -->
			<section class="favs" aria-labelledby="qa-favs">
				<div class="more-label favs-head">
					<h3 id="qa-favs">Favorites</h3>
					<a href="/settings/favorites" onclick={() => (open = false)}>Edit<span class="sr-only"> favorites</span> ›</a>
				</div>
				<ul class="fav-list">
					{#each pinned as f (f.id)}
						<li>
							<a class="fav" href={favoriteHref(f, tankId, when)} onclick={() => (open = false)}>
								<CategoryIcon kind={f.kind} size={36} />
								<span class="t">
									<span class="title">{f.label}</span>
									{#if f.sub}<span class="sub">{f.sub}</span>{/if}
								</span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if runnable.length}
			<!-- maintenance routines (#92): the tank's sequences, each a Run -->
			<section class="favs" aria-labelledby="qa-routines">
				<div class="more-label favs-head">
					<h3 id="qa-routines">Routines</h3>
					<a href="/tanks/{tankId}/routines" onclick={() => (open = false)}>Edit<span class="sr-only"> routines</span> ›</a>
				</div>
				<ul class="fav-list">
					{#each runnable as r (r.id)}
						<li>
							<a class="fav" href="/tanks/{r.tankId}/routines/{r.id}/run" onclick={() => (open = false)}>
								<CategoryIcon kind="maintenance" size={36} />
								<span class="t">
									<span class="title">Run {r.name}</span>
									<span class="sub">{r.steps} step{r.steps === 1 ? '' : 's'}</span>
								</span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- phones: three wide rows (04); the desktop's Log ▾ menu already has these -->
		<div class="big hide-desk">
			<a class="choice primary" href={href('/entries/test/new')} onclick={() => (open = false)}>
				<span class="ic hide-desk"><CategoryIcon kind="test" size={44} inverted /></span>
				<span class="ic hide-phone"><CategoryIcon kind="test" size={36} inverted /></span>
				<span class="t">
					<span class="title"><span class="hide-desk">Log water test</span><span class="hide-phone">Water test</span></span>
					<span class="sub hide-desk">{lastTest}</span>
				</span>
				<kbd>T</kbd>
			</a>
			<a
				class="choice"
				href={href('/entries/event/new', { category: 'water_change' })}
				onclick={() => (open = false)}
			>
				<span class="ic hide-desk"><CategoryIcon kind="water_change" size={44} /></span>
				<span class="ic hide-phone"><CategoryIcon kind="water_change" size={36} /></span>
				<span class="t">
					<span class="title"><span class="hide-desk">Log water change</span><span class="hide-phone">Water change</span></span>
					{#if wcDue && wcDue.level !== 'ok'}
						<span class="sub hide-desk status-{wcDue.level}"
							>{wcDue.days < 0 ? `✕ ${-wcDue.days} day${wcDue.days === -1 ? '' : 's'} overdue` : wcDue.text}</span
						>
					{/if}
				</span>
				<kbd>W</kbd>
			</a>
			<a class="choice" href={href('/entries/event/new', { category: 'note' })} onclick={() => (open = false)}>
				<span class="ic hide-desk"><CategoryIcon kind="note" size={44} /></span>
				<span class="ic hide-phone"><CategoryIcon kind="note" size={36} /></span>
				<span class="t">
					<span class="title"><span class="hide-desk">Add note or photo</span><span class="hide-phone">Note / photo</span></span>
					<span class="sub hide-desk">Opens camera or library</span>
				</span>
				<kbd>N</kbd>
			</a>
		</div>

		<section class="more" aria-labelledby="qa-more">
			<h3 class="more-label" id="qa-more">More</h3>
			<div class="tiles">
				{#each more as m (m.label)}
					<a class="tile" class:hide-desk={'phone' in m} href={'to' in m ? m.to(tankId ?? '') : href('/entries/event/new', { category: m.category })} onclick={() => (open = false)}>
						<CategoryIcon kind={m.category} size={32} />
						<span>{m.label}</span>
					</a>
				{/each}
				<a class="tile" href="/tanks/{tankId}/import/tests" onclick={() => (open = false)}>
					<CategoryIcon kind="import" size={32} />
					<span>Import a spreadsheet</span>
				</a>
			</div>
		</section>
		{#if !pinned.length}
			<p class="pin"><a href="/settings/favorites" onclick={() => (open = false)}>Pin what you log most as favorites ›</a></p>
		{/if}
		<p class="hint">Press + anywhere to open, then T, W or N.</p>
	{/if}
</Sheet>

<TankSwitcher bind:open={pickingTank} {tanks} currentId={tankId} onpick={(id) => (tankId = id)} />
<DateTimePicker bind:open={pickingWhen} value={when} {timeZone} onselect={(v) => (when = v)} />

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.head h2 {
		margin: 0;
		font-size: 22px;
		flex: 1;
	}
	.close {
		font-size: 14px;
		font-weight: 800;
		color: var(--accent-text);
		min-height: 44px;
		padding: 0 4px;
	}
	.ctx {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.when {
		font-weight: 400;
	}
	.big {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.choice {
		display: flex;
		align-items: center;
		gap: 16px;
		height: 72px;
		padding: 0 16px;
		border: 1px solid var(--divider);
		color: var(--text);
	}
	.choice:hover {
		color: var(--text);
		border-color: var(--ink);
	}
	.choice.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}
	.choice.primary:hover {
		color: var(--on-accent);
	}
	.ic {
		display: contents;
	}
	.t {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.title {
		font-size: 17px;
		font-weight: 800;
	}
	.sub {
		font-size: 13px;
		color: var(--text-muted);
	}
	.primary .sub {
		color: var(--on-accent-2);
	}
	kbd {
		display: none;
		font-family: inherit;
		font-size: 12px;
		font-weight: 800;
		color: var(--text-muted);
	}
	.primary kbd {
		color: var(--on-accent);
	}
	.more {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.more-label {
		margin: 0;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		font-size: 11px;
		font-weight: 400;
		color: var(--text-muted);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	/* the same tile for each: icon at the top, name below */
	.tiles {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		grid-auto-rows: 1fr;
		gap: 6px;
	}
	.tile {
		min-height: 84px;
		padding: 12px;
		border: 1px solid var(--divider);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 8px;
		color: var(--text);
		font-size: 13px;
		font-weight: 700;
		line-height: 1.25;
		overflow-wrap: break-word;
	}
	/* small phones: two across, so no name breaks mid-word */
	@media (max-width: 379px) {
		.tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.tile:hover {
		color: var(--text);
		border-color: var(--ink);
	}
	/* favorites: a heading like More's, then a row per favorite (icon, name, what it opens with) */
	.favs {
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.favs-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}
	.favs-head h3 {
		margin: 0;
		font: inherit;
	}
	.favs-head a {
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0;
		text-transform: none;
		color: var(--accent-text);
	}
	.fav-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.fav-list li {
		border-bottom: 1px solid var(--divider);
	}
	.fav {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 6px 0;
		color: var(--text);
	}
	.fav:hover {
		color: var(--text);
	}
	.fav:hover .title {
		text-decoration: underline;
	}
	.fav .title {
		font-size: 15px;
	}
	.pin {
		margin: 0;
		font-size: 13px;
	}
	.pin a {
		color: var(--accent-text);
		font-weight: 800;
	}
	.hint {
		display: none;
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	@media (min-width: 1024px) {
		.big {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
		}
		/* icon at the top, name and key along the bottom */
		.choice {
			height: 112px;
			padding: 14px;
			display: grid;
			grid-template: 'icon icon' 1fr 'title key' auto / 1fr auto;
			align-items: baseline;
			gap: 0 8px;
		}
		.choice :global(.icon) {
			grid-area: icon;
			align-self: start;
		}
		.t {
			grid-area: title;
		}
		.title {
			font-size: 15px;
		}
		kbd {
			display: block;
			grid-area: key;
		}
		.tile {
			min-height: 80px;
		}
		.hint {
			display: block;
		}
	}
</style>
