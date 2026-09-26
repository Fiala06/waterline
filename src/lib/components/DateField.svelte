<script lang="ts">
	// A date field that reads like the designs ("Mar 8, 2025", "Thu, Sep 25", "Today") and
	// opens a calendar sheet (G9 look). Without JS it is the browser's own date input.
	import { onMount } from 'svelte';
	import Sheet from './Sheet.svelte';
	import { addDays } from '$lib/time';

	let {
		name,
		value = $bindable(''),
		id,
		min,
		max,
		required = false,
		today,
		format = 'long',
		label = 'Date',
		invalid = false
	}: {
		name: string;
		/** YYYY-MM-DD */
		value?: string;
		id?: string;
		min?: string;
		max?: string;
		required?: boolean;
		/** YYYY-MM-DD in the user's time zone: shown as "Today" and ringed in the calendar */
		today?: string;
		/** "Mar 8, 2025" or "Thu, Sep 25" */
		format?: 'long' | 'weekday';
		/** Sheet title and accessible name */
		label?: string;
		invalid?: boolean;
	} = $props();

	const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
	let js = $state(false);
	onMount(() => (js = true));
	let open = $state(false);
	let month = $state(''); // YYYY-MM shown

	const noon = (d: string) => new Date(d + 'T12:00:00Z');
	const text = $derived.by(() => {
		if (!value) return '—';
		if (today && value === today) return 'Today';
		const d = noon(value);
		const sameYear = today ? value.slice(0, 4) === today.slice(0, 4) : false;
		return format === 'weekday'
			? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC' })
			: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
	});

	function show() {
		month = (value || today || new Date().toISOString().slice(0, 10)).slice(0, 7);
		open = true;
	}
	const cells = $derived.by(() => {
		if (!month) return [];
		const first = `${month}-01`;
		const out: (string | null)[] = Array(noon(first).getUTCDay()).fill(null);
		for (let d = first; d.startsWith(month); d = addDays(d, 1)) out.push(d);
		return out;
	});
	const monthLabel = $derived(month ? noon(month + '-15').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
	function shiftMonth(n: number) {
		const [y, m] = month.split('-').map(Number);
		month = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
	}
	const out = (d: string) => (min != null && d < min) || (max != null && d > max);
	const canPrev = $derived(!min || month > min.slice(0, 7));
	const canNext = $derived(!max || month < max.slice(0, 7));
	function pick(d: string) {
		value = d;
		open = false;
	}
</script>

{#if js}
	<input type="hidden" {name} {value} />
	<button type="button" class="input date-btn" class:invalid {id} aria-haspopup="dialog" onclick={show}>
		<span class:placeholder={!value}>{text}</span>
		<span class="cal" aria-hidden="true"></span>
	</button>
	<Sheet bind:open {label} width={420}>
		<div class="head">
			<h2>{label}</h2>
			<div class="head-actions">
				{#if !required && value}<button type="button" class="btn-text clear" onclick={() => pick('')}>Clear</button>{/if}
				{#if today && !out(today)}<button type="button" class="chip" onclick={() => pick(today)}>Today</button>{/if}
			</div>
		</div>
		<div class="nav">
			<button type="button" class="btn-icon" aria-label="Previous month" disabled={!canPrev} onclick={() => shiftMonth(-1)}>‹</button>
			<div class="month">{monthLabel}</div>
			<button type="button" class="btn-icon" aria-label="Next month" disabled={!canNext} onclick={() => shiftMonth(1)}>›</button>
		</div>
		<div class="grid" role="group" aria-label={monthLabel}>
			{#each WEEKDAYS as w, i (i)}<div class="dow" aria-hidden="true">{w}</div>{/each}
			{#each cells as c, i (c ?? `blank-${i}`)}
				{#if c}
					<button
						type="button"
						class="day"
						class:selected={c === value}
						class:today={c === today}
						disabled={out(c)}
						aria-pressed={c === value}
						aria-label={noon(c).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
						onclick={() => pick(c)}>{Number(c.slice(8))}</button
					>
				{:else}
					<div></div>
				{/if}
			{/each}
		</div>
	</Sheet>
{:else}
	<input class="input" {id} {name} type="date" bind:value {min} {max} {required} aria-invalid={invalid} />
{/if}

<style>
	.date-btn {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		text-align: left;
		cursor: pointer;
	}
	.date-btn.invalid {
		border-color: var(--bad);
	}
	.placeholder {
		color: var(--placeholder);
	}
	/* a small calendar glyph */
	.cal {
		width: 16px;
		height: 15px;
		flex-shrink: 0;
		border: 2px solid var(--text-muted);
		border-top-width: 4px;
		border-radius: 3px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	h2 {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
	}
	.head-actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.clear {
		color: var(--text-muted);
	}
	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.nav .btn-icon {
		background: none;
	}
	.nav .btn-icon:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.month {
		font-size: 17px;
		font-weight: 600;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		row-gap: 4px;
		justify-items: center;
	}
	.dow {
		font-size: 12px;
		color: var(--text-faint);
		padding: 4px 0;
	}
	/* G9: 36px pills in 44px rows */
	.day {
		position: relative;
		width: 48px;
		max-width: 100%;
		height: 36px;
		margin: 4px 0;
		border-radius: 18px;
		font-size: 16px;
		font-variant-numeric: tabular-nums;
	}
	.day::after {
		content: '';
		position: absolute;
		inset: -4px 0;
	}
	.day.today {
		box-shadow: inset 0 0 0 1px var(--accent);
		color: var(--accent);
		font-weight: 600;
	}
	.day.selected {
		background: var(--accent);
		color: var(--on-accent);
		font-weight: 700;
		box-shadow: none;
	}
	.day:disabled {
		color: var(--placeholder);
		cursor: default;
	}
	@media (hover: hover) {
		.day:not(:disabled):not(.selected):hover {
			background: var(--surface-hi);
		}
	}
</style>
