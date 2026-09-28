<script lang="ts">
	// 04 / D12 · Quick add. Defaults to the current tank and now; both changeable.
	// The three main kinds big (rows on phones, tiles on desktop), then the rest
	// and importing as one grid of the same smaller tiles.
	// Desktop keys: T water test, W water change, N note.
	import { goto } from '$app/navigation';
	import CategoryIcon from './CategoryIcon.svelte';
	import DateTimePicker from './DateTimePicker.svelte';
	import Sheet from './Sheet.svelte';
	import TankSwitcher from './TankSwitcher.svelte';
	import { whenLabel, type When } from '$lib/time';
	import type { DueInfo } from '$lib/tasks';

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
		wcDue
	}: {
		open?: boolean;
		tanks: TankSummary[];
		currentTankId: string | null;
		timeZone: string;
		lastTest: string;
		wcDue: DueInfo | null;
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
	const more = [
		{ category: 'dosing', label: 'Dosing' },
		{ category: 'maintenance', label: 'Maintenance' },
		{ category: 'livestock', label: 'Livestock / plants' },
		{ category: 'equipment', label: 'Equipment' },
		{ category: 'observation', label: 'Observation' }
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

		<!-- phones: three wide rows (04); desktop: three tiles with their key (D12) -->
		<div class="big">
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
				{#each more as m (m.category)}
					<a class="tile" href={href('/entries/event/new', { category: m.category })} onclick={() => (open = false)}>
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
		font-weight: 600;
		flex: 1;
	}
	.close {
		font-size: 15px;
		color: var(--text-muted);
		min-height: 44px;
		padding: 0 4px;
	}
	.close:hover {
		color: var(--text);
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
		gap: 10px;
	}
	.choice {
		display: flex;
		align-items: center;
		gap: 16px;
		height: 76px;
		padding: 0 18px;
		border-radius: 18px;
		background: var(--surface-hi);
		border: 1px solid var(--border-strong);
		color: var(--text);
	}
	.choice:hover {
		color: var(--text);
		border-color: var(--accent);
	}
	.choice.primary {
		background: var(--accent);
		border-color: var(--accent);
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
		font-size: 18px;
		font-weight: 600;
	}
	.primary .title {
		font-weight: 700;
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
		font-family: ui-monospace, Menlo, monospace;
		font-size: 12px;
		color: var(--text-muted);
	}
	.primary kbd {
		color: var(--on-accent);
		font-weight: 700;
	}
	.more {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.more-label {
		margin: 0;
		font-size: 13px;
		font-weight: 400;
		color: var(--text-muted);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	/* the same tile for each: icon at the top, name below, as the big desktop tiles */
	.tiles {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		grid-auto-rows: 1fr;
		gap: 8px;
	}
	.tile {
		min-height: 88px;
		padding: 12px;
		border-radius: 14px;
		background: var(--surface-hi);
		border: 1px solid var(--border-strong);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 8px;
		color: var(--text);
		font-size: 14px;
		font-weight: 600;
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
		border-color: var(--accent);
	}
	.hint {
		display: none;
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
	}
	@media (min-width: 1024px) {
		.close {
			font-size: 14px;
		}
		.ctx .chip {
			height: 38px;
		}
		.big {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
		}
		/* icon at the top, name and key along the bottom */
		.choice {
			height: 120px;
			padding: 16px;
			border-radius: 16px;
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
			font-size: 16px;
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
