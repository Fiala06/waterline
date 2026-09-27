<script lang="ts">
	import { statusIcon, type StatusLevel } from '$lib/status';
	import Sparkline from './Sparkline.svelte';
	let {
		label,
		value,
		unit,
		level,
		statusText,
		sub,
		compact = false,
		range = '',
		spark = []
	}: {
		label: string;
		value: string | null;
		unit: string;
		level: StatusLevel;
		statusText: string;
		sub: string;
		/** Design 1a from 1024px wide: the status as its glyph, a sparkline, the target without "Target". Phones keep the full card. */
		compact?: boolean;
		/** the target without its unit ("6.5–7.5"), when there's a reading */
		range?: string;
		/** the last readings, oldest first, for the sparkline */
		spark?: number[];
	} = $props();
	/** "Near low" from "▲ Near low": beside the glyph on phones, in title and aria-label on desktop */
	const word = $derived(statusText.replace(/^\S+\s+/, ''));
</script>

<div class="pcard {level}" class:compact>
	<div class="top">
		<span class="label">{label}</span>
		{#if compact}
			<span class="status" role="img" title={word} aria-label={word}>{statusIcon[level]}<span class="full">{` ${word}`}</span></span>
		{:else}
			<span class="status">{statusText}</span>
		{/if}
	</div>
	<div class="value-row">
		<span class="value num">{value ?? '—'}</span>
		{#if value != null && unit}<span class="unit">{unit}</span>{/if}
	</div>
	{#if compact}<div class="spark-box"><Sparkline values={spark} {level} /></div>{/if}
	<div class="sub">{#if compact && range}<span class="full">Target{' '}</span>{range}{:else}{sub}{/if}</div>
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
	.spark-box {
		display: none;
	}

	/* 1a: seven across on the desktop dashboard */
	@media (min-width: 1024px) {
		.compact {
			padding: 10px 10px 8px;
			border-radius: 12px;
			gap: 4px;
		}
		.compact .top {
			font-size: 12px;
		}
		.compact .label {
			color: var(--text-2);
		}
		.compact:not(.none) .status {
			font-weight: 700;
		}
		.compact .full {
			display: none;
		}
		.compact .value {
			font-size: 22px;
			font-weight: 700;
		}
		.compact .unit {
			font-size: 11px;
			color: var(--text-muted);
		}
		.compact .spark-box {
			display: block;
			height: 18px;
		}
		.compact .sub {
			font-size: 11px;
			white-space: nowrap;
		}
	}
</style>
