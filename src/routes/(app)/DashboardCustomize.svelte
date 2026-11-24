<script lang="ts">
	// Customize this dashboard (#94): a few light choices, kept on the account;
	// Reset brings the defaults back. Out of the dashboard (#362).
	import { enhance } from '$app/forms';
	import { customized, DASHBOARD_SECTIONS, MAX_PRIORITY, type DashboardChoices } from '$lib/dashboard';
	import { shortName } from '$lib/params';
	import type { PageData } from './$types';

	let { tankId, tankType, params, choices }: { tankId: string; tankType: string; params: PageData['params']; choices: DashboardChoices } = $props();
	const hidden = $derived(choices.hidden);
</script>

<!-- Customize (#94): a few light choices, kept on the account; Reset brings the defaults back -->
<details class="customize">
	<summary><span class="sq" aria-hidden="true">⚙</span>Customize this dashboard{customized(choices) ? ' · changed' : ''}</summary>
	<form method="POST" action="?/customize" class="cz" use:enhance>
		<input type="hidden" name="tankId" value={tankId} />
		<div class="field">
			<label class="label" for="cz-trend">Trends opens on</label>
			<select class="input" id="cz-trend" name="trend">
				<option value="" selected={!choices.trendParamId}>Automatic · what’s out of range, else the first with readings</option>
				{#each params ?? [] as p (p.id)}<option value={p.id} selected={choices.trendParamId === p.id}>{p.name}</option>{/each}
			</select>
		</div>
		<fieldset class="field">
			<legend class="label">Listed first in Tank parameters · up to {MAX_PRIORITY}, in their usual order</legend>
			<div class="chips cz-chips">
				{#each params ?? [] as p (p.id)}
					<label class="chip pick"><input type="checkbox" name="priority" value={p.id} checked={choices.priority.includes(p.id)} />{shortName(p)}</label>
				{/each}
			</div>
		</fieldset>
		<fieldset class="field">
			<legend class="label">Show</legend>
			<div class="cz-show">
				{#each DASHBOARD_SECTIONS as sec (sec.key)}
					{#if sec.planted && tankType !== 'planted'}
						<input type="hidden" name="show" value={sec.key} />
					{:else}
						<label class="cz-row"><input type="checkbox" name="show" value={sec.key} checked={!hidden.includes(sec.key)} /><span class="o-text"><span class="o-t">{sec.label}</span><span class="o-s">{sec.sub}</span></span></label>
					{/if}
				{/each}
			</div>
		</fieldset>
		<div class="cz-acts">
			{#if customized(choices)}<button class="btn" formaction="?/resetDashboard">Reset to defaults</button>{/if}
			<button class="btn btn-primary">Save</button>
		</div>
	</form>
</details>

<style>
	/* Customize: folded away under the grid; a small form when open */
	.customize {
		margin-top: 28px;
		border-top: 1px solid var(--divider);
	}
	.customize summary {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		font-size: 13px;
		font-weight: 800;
		color: var(--text-muted);
		cursor: pointer;
		list-style: none;
	}
	.customize summary::-webkit-details-marker {
		display: none;
	}
	.customize summary .sq {
		font-size: 15px;
	}
	.customize[open] summary {
		color: var(--text);
	}
	.cz {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 4px 0 8px;
		max-width: 640px;
	}
	.cz-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	/* each part a row with its box: ticked means shown */
	.cz-show {
		display: flex;
		flex-direction: column;
		border-top: 2px solid var(--ink);
	}
	.cz-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 48px;
		padding: 6px 0;
		border-bottom: 1px solid var(--divider);
		cursor: pointer;
	}
	.cz-row input {
		width: 20px;
		height: 20px;
		margin: 0;
		flex-shrink: 0;
		accent-color: var(--accent);
	}
	.o-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.o-t {
		font-weight: 700;
	}
	.o-s {
		font-size: 12px;
		color: var(--text-muted);
	}
	.cz-acts {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
	}
	.cz-acts .btn {
		min-height: 44px;
	}
	/* as the dashboard's chips: to the screen edge on phones */
	.chips {
		margin: 14px -20px 0;
		padding-inline: 20px;
	}
	@media (min-width: 1024px) {
		.chips {
			margin: 14px 0 0;
			padding-inline: 0;
			flex-wrap: wrap;
		}
	}
</style>
