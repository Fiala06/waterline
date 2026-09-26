<script lang="ts">
	import type { StatusLevel } from '$lib/status';
	let {
		label,
		value,
		unit,
		level,
		statusText,
		sub
	}: {
		label: string;
		value: string | null;
		unit: string;
		level: StatusLevel;
		statusText: string;
		sub: string;
	} = $props();
</script>

<div class="pcard {level}">
	<div class="top">
		<span class="label">{label}</span>
		<span class="status">{statusText}</span>
	</div>
	<div class="value-row">
		<span class="value num">{value ?? '—'}</span>
		{#if value != null && unit}<span class="unit">{unit}</span>{/if}
	</div>
	<div class="sub">{sub}</div>
</div>

<style>
	.pcard {
		border-radius: 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
		--label: var(--text-muted);
		--sub: var(--text-faint);
		--status: var(--ok);
	}
	.pcard.warn {
		background: var(--warn-bg);
		border-color: var(--warn-border);
		--label: var(--warn-text);
		--sub: var(--warn-text);
		--status: var(--warn);
	}
	.pcard.bad {
		background: var(--bad-bg);
		border-color: var(--bad-border);
		--label: var(--bad-text);
		--sub: var(--bad-text);
		--status: var(--bad);
	}
	.pcard.none {
		background: transparent;
		border: 1px dashed var(--border-strong);
		--status: var(--text-muted);
	}
	.top {
		display: flex;
		justify-content: space-between;
		gap: 6px;
		font-size: 13px;
	}
	.label {
		color: var(--label);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.status {
		color: var(--status);
		flex-shrink: 0;
		white-space: nowrap;
		font-weight: 600;
	}
	.none .status {
		font-weight: 400;
	}
	.value-row {
		display: flex;
		align-items: baseline;
		gap: 4px;
	}
	.value {
		font-size: 26px;
		font-weight: 600;
	}
	.none .value {
		color: var(--placeholder);
	}
	.unit {
		font-size: 13px;
		color: var(--label);
	}
	.sub {
		font-size: 12px;
		color: var(--sub);
	}
</style>
