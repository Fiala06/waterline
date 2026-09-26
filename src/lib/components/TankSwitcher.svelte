<script lang="ts">
	// G1 · Tank switcher. Picks a tank; the caller decides what that does.
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
		<h2>Switch tank</h2>
		<a href="/tanks" onclick={() => (open = false)}>Manage</a>
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
					<TankThumb cover={t.cover} />
					<span class="text">
						<span class="name">{t.name}</span>
						<span class="sub">{tankTypeLabel(t.type)}{t.volume ? ` · ${t.volume}` : ''}</span>
					</span>
					<span class="right">
						{#if t.alerts}
							<span class="pill-bad">{t.alerts} alert{t.alerts === 1 ? '' : 's'}</span>
						{:else if t.tested}
							<span class="good">All good</span>
						{:else}
							<span class="nodata">No data</span>
						{/if}
						{#if t.id === currentId}<span class="viewing">Viewing</span>{/if}
					</span>
				</button>
			</li>
		{/each}
	</ul>
	<a class="btn add" href="/tanks/new" onclick={() => (open = false)}>+ Add tank</a>
	{#if tanks.length > 1}<p class="tip">Tip: swipe left or right on the tank name to switch</p>{/if}
</Sheet>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	h2 {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
	}
	.head a {
		font-size: 15px;
		font-weight: 600;
		padding: 10px 0;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		border-radius: 16px;
		border: 1px solid var(--border);
		text-align: left;
	}
	.row.current {
		background: var(--selected);
		border-color: var(--accent);
	}
	.text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.name {
		font-size: 16px;
		font-weight: 600;
	}
	.sub {
		font-size: 13px;
		color: var(--text-muted);
	}
	.right {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}
	.pill-bad {
		font-size: 12px;
		font-weight: 700;
		background: var(--bad-bg);
		color: var(--bad-text);
		padding: 2px 8px;
		border-radius: 10px;
	}
	.good,
	.nodata {
		font-size: 12px;
		font-weight: 600;
		color: var(--ok);
	}
	.nodata {
		color: var(--text-muted);
	}
	.viewing {
		font-size: 13px;
		font-weight: 700;
		color: var(--accent);
	}
	.add {
		border-style: dashed;
		color: var(--accent);
	}
	.tip {
		margin: -6px 0 0;
		text-align: center;
		font-size: 13px;
		color: var(--text-faint);
	}
	/* the swipe is on the phone dashboard's tank name */
	@media (min-width: 1024px) {
		.tip {
			display: none;
		}
	}
</style>
