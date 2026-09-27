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
		short = label,
		fullName = label,
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
		/** compact: the name that fits ("NH₃"), with `fullName` ("Ammonia") on hover and for screen readers */
		short?: string;
		fullName?: string;
		/** the target without its unit ("6.5–7.5"), when there's a reading */
		range?: string;
		/** the last readings, oldest first, for the sparkline */
		spark?: number[];
	} = $props();
	/** "Near low" from "▲ Near low": beside the glyph on phones, in title and aria-label on desktop */
	const word = $derived(statusText.replace(/^\S+\s+/, ''));
	// the full name pops up over a short one, or a long one the card may cut
	const tip = $derived(compact && (fullName !== short || fullName.length > 7));
</script>

<div class="pcard {level}" class:compact>
	<div class="top">
		{#if compact}
			<span class="label" class:tipped={tip}
				><span class="full">{label}</span><span class="short" aria-hidden="true">{short}</span><span class="spoken">{fullName}</span></span
			>
			{#if tip}<span class="name-tip" aria-hidden="true">{fullName}</span>{/if}
			<span class="status" role="img" title={word} aria-label={word}>{statusIcon[level]}<span class="full">{` ${word}`}</span></span>
		{:else}
			<span class="label">{label}</span>
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
	.spark-box,
	.short,
	.spoken,
	.name-tip {
		display: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.name-tip {
			transition: none;
		}
	}

	/* 1a: seven across on the desktop dashboard */
	@media (min-width: 1024px) {
		.compact {
			padding: 10px 10px 8px;
			border-radius: 12px;
			gap: 4px;
		}
		.compact .top {
			position: relative;
			font-size: 12px;
		}
		.compact .label {
			flex: 1;
			color: var(--text-2);
		}
		.compact .short {
			display: inline;
		}
		/* read out in full ("Ammonia", not "N H 3") */
		.compact .spoken {
			display: block;
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		/* the full name on hover, like the chart's marker popup */
		.compact .name-tip {
			display: block;
			position: absolute;
			left: -6px;
			bottom: calc(100% + 8px);
			z-index: 3;
			padding: 6px 10px;
			border-radius: 10px;
			background: var(--bg);
			border: 1px solid var(--border-strong);
			box-shadow: var(--shadow-toast);
			color: var(--text);
			font-size: 13px;
			font-weight: 600;
			white-space: nowrap;
			pointer-events: none;
			opacity: 0;
			visibility: hidden;
			transition:
				opacity 0.12s,
				visibility 0.12s;
		}
		.compact .tipped {
			cursor: help;
		}
		.compact .tipped:hover ~ .name-tip {
			opacity: 1;
			visibility: visible;
			transition-delay: 0.15s;
		}
		.compact:not(.none) .status {
			font-weight: 700;
		}
		.compact .full {
			display: none;
		}
		/* a unit too wide for the card goes under its value */
		.compact .value-row {
			flex-wrap: wrap;
			row-gap: 0;
		}
		.compact .value {
			font-size: 22px;
			font-weight: 700;
		}
		.compact .unit {
			font-size: 11px;
			color: var(--text-muted);
		}
		/* the line and range sit at the bottom, so a row's cards line up */
		.compact .spark-box {
			display: block;
			height: 18px;
			margin-top: auto;
		}
		.compact .sub {
			font-size: 11px;
			white-space: nowrap;
		}
	}
</style>
