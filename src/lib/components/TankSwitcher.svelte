<script lang="ts">
	// Switch tank (redesign README → Phone › Switch tank): a sheet with "Your
	// tanks" over a 2px ink rule, 72px rows with a 48px thumbnail, the name and
	// spec, and the status at the end; the current one has a surface background
	// and a 3px accent bar. Picks a tank; the caller decides what that does.
	import { tankTypeLabel } from '$lib/types';
	import Sheet from './Sheet.svelte';
	import TankThumb from './TankThumb.svelte';

	interface TankSummary {
		id: string;
		name: string;
		type: string;
		volume: string | null;
		alerts: number;
		cover?: string | null;
		tested?: boolean;
	}
	let {
		open = $bindable(false),
		tanks,
		currentId,
		onpick
	}: {
		open?: boolean;
		tanks: TankSummary[];
		currentId: string | null;
		onpick: (id: string) => void;
	} = $props();
</script>

<Sheet bind:open label="Switch tank" width={440}>
	<div class="head">
		<h2>Your tanks</h2>
		<span class="meta">{tanks.length} active</span>
	</div>
	<ul class="list">
		{#each tanks as t (t.id)}
			<li>
				<button
					type="button"
					class="row"
					class:current={t.id === currentId}
					aria-current={t.id === currentId}
					onclick={() => {
						onpick(t.id);
						open = false;
					}}
				>
					<TankThumb cover={t.cover} size={48} />
					<span class="text">
						<span class="name">{t.name}</span>
						<span class="sub">{tankTypeLabel(t.type)}{t.volume ? ` · ${t.volume}` : ''}</span>
					</span>
					{#if t.alerts}
						<span class="st status-bad">✕ {t.alerts} need{t.alerts === 1 ? 's' : ''} attention</span>
					{:else if t.tested}
						<span class="st">✓ All in range</span>
					{:else}
						<span class="st">– No data</span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
	<div class="foot">
		<a class="btn add" href="/tanks/new" onclick={() => (open = false)}>+ Add tank</a>
		<a class="btn-text all" href="/tanks" onclick={() => (open = false)}>All tanks &amp; archived ›</a>
	</div>
</Sheet>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding-bottom: 10px;
		border-bottom: 2px solid var(--ink);
	}
	h2 {
		margin: 0;
		font-size: 22px;
		font-weight: 800;
	}
	.meta {
		font-size: 13px;
		color: var(--text-muted);
	}
	.list {
		list-style: none;
		margin: -18px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.row {
		width: 100%;
		min-height: 72px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0;
		border-bottom: 1px solid var(--divider);
		border-left: 3px solid transparent;
		text-align: left;
		color: var(--text);
	}
	.row.current {
		background: var(--surface);
		border-left-color: var(--accent);
		padding: 0 10px;
	}
	.text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.name {
		font-size: 17px;
		font-weight: 800;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sub {
		font-size: 13px;
		color: var(--text-muted);
	}
	.st {
		flex-shrink: 0;
		font-size: 12px;
		font-weight: 800;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.foot {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: -4px;
	}
	.add {
		min-height: 48px;
	}
	.all {
		align-self: flex-start;
		padding: 0;
	}
	@media (hover: hover) {
		.row:not(.current):hover {
			background: var(--surface);
		}
	}
</style>
