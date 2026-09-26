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
				{whenLabel(when)} <span class="caret">▾</span>
			</button>
		</div>

		<!-- phones: three wide rows (04); desktop: three tiles with their key (D12) -->
		<div class="big">
			<a class="choice primary" href={href('/log/test')} onclick={() => (open = false)}>
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
				href={href('/log/event', { category: 'water_change' })}
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
			<a class="choice" href={href('/log/event', { category: 'note' })} onclick={() => (open = false)}>
				<span class="ic hide-desk"><CategoryIcon kind="note" size={44} /></span>
				<span class="ic hide-phone"><CategoryIcon kind="note" size={36} /></span>
				<span class="t">
					<span class="title"><span class="hide-desk">Add note or photo</span><span class="hide-phone">Note / photo</span></span>
					<span class="sub hide-desk">Opens camera or library</span>
				</span>
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
		.more-label {
			display: none;
		}
		.more-list .btn {
			min-height: 38px;
			padding: 0 14px;
			border-radius: 10px;
			font-size: 14px;
		}
		.hint {
			display: block;
		}
	}
</style>
