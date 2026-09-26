<script lang="ts">
	// 04 / D12 · Quick add. Defaults to the current tank and now; both changeable.
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

	const more = [
		{ category: 'dosing', label: 'Dosing' },
		{ category: 'maintenance', label: 'Maintenance' },
		{ category: 'livestock', label: 'Livestock / plants' },
		{ category: 'equipment', label: 'Equipment' },
		{ category: 'observation', label: 'Observation' }
	];

	function onkeydown(e: KeyboardEvent) {
		if (!open || pickingTank || pickingWhen || e.metaKey || e.ctrlKey || e.altKey) return;
		const t = e.target as HTMLElement;
		if (t.closest('input, textarea, select')) return;
		const k = e.key.toLowerCase();
		const target =
			k === 't'
				? href('/log/test')
				: k === 'w'
					? href('/log/event', { category: 'water_change' })
					: k === 'n'
						? href('/log/event', { category: 'note' })
						: null;
		if (target) {
			e.preventDefault();
			open = false;
			goto(target);
		}
	}
</script>

<svelte:window {onkeydown} />

<Sheet bind:open title="Quick add" width={560}>
	{#if !tank}
		<p class="muted">Add a tank first to start logging.</p>
		<a class="btn btn-primary btn-lg" href="/tanks/new" onclick={() => (open = false)}>Add tank</a>
	{:else}
		<div class="ctx">
			<button type="button" class="chip chip-pill" onclick={() => (pickingTank = true)}>
				{tank.name} <span class="caret">▾</span>
			</button>
			<button type="button" class="chip chip-pill when" onclick={() => (pickingWhen = true)}>
				{whenLabel(when)} <span class="caret">▾</span>
			</button>
		</div>

		<div class="big">
			<a class="choice primary" href={href('/log/test')} onclick={() => (open = false)}>
				<CategoryIcon kind="test" size={44} inverted />
				<span class="t">
					<span class="title">Log water test</span>
					<span class="sub">{lastTest}</span>
				</span>
				<kbd>T</kbd>
			</a>
			<a
				class="choice"
				href={href('/log/event', { category: 'water_change' })}
				onclick={() => (open = false)}
			>
				<CategoryIcon kind="water_change" size={44} />
				<span class="t">
					<span class="title">Log water change</span>
					{#if wcDue && wcDue.level !== 'ok'}
						<span class="sub status-{wcDue.level}"
							>{wcDue.days < 0 ? `✕ ${-wcDue.days} day${wcDue.days === -1 ? '' : 's'} overdue` : wcDue.text}</span
						>
					{/if}
				</span>
				<kbd>W</kbd>
			</a>
			<a class="choice" href={href('/log/event', { category: 'note' })} onclick={() => (open = false)}>
				<CategoryIcon kind="note" size={44} />
				<span class="t"><span class="title">Add note</span></span>
				<kbd>N</kbd>
			</a>
		</div>

		<div class="more">
			<div class="more-label">More</div>
			<div class="more-list">
				{#each more as m (m.category)}
					<a class="btn" href={href('/log/event', { category: m.category })} onclick={() => (open = false)}
						>{m.label}</a
					>
				{/each}
			</div>
		</div>
		<p class="hint">Press + anywhere to open, then T, W or N.</p>
	{/if}
</Sheet>

<TankSwitcher bind:open={pickingTank} {tanks} currentId={tankId} onpick={(id) => (tankId = id)} />
<DateTimePicker bind:open={pickingWhen} value={when} {timeZone} onselect={(v) => (when = v)} />

<style>
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
		font-family: inherit;
		font-size: 12px;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 6px;
		border: 1px solid currentColor;
		opacity: 0.7;
	}
	.more {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.more-label {
		font-size: 13px;
		color: var(--text-muted);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.more-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.more-list .btn {
		font-weight: 400;
	}
	.hint {
		display: none;
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
	}
	@media (min-width: 1024px) {
		kbd,
		.hint {
			display: inline-block;
		}
	}
</style>
