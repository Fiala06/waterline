<script lang="ts">
	import { untrack } from 'svelte';
	// G9 · Date / time picker. Backdating is allowed; future dates are disabled.
	// Quick picks under the title set an earlier time in one tap, like Now.
	import Sheet from './Sheet.svelte';
	import { addDays, quickWhens, todayInZone, utcToZoned, whenLabel, type When } from '$lib/time';

	let {
		open = $bindable(false),
		value,
		timeZone,
		onselect
	}: {
		open?: boolean;
		value: When | null; // null = now
		timeZone: string;
		onselect: (v: When | null) => void;
	} = $props();

	const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

	let today = $state(untrack(() => todayInZone(timeZone)));
	let date = $state('');
	let time = $state('');
	let month = $state(''); // YYYY-MM shown
	let quick = $state<ReturnType<typeof quickWhens>>([]);

	// Start from the current choice each time it opens. Untracked, so picking a day
	// (which changes `date`) doesn't re-run this and undo the pick.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			const now = utcToZoned(new Date(), timeZone);
			today = now.date;
			date = value?.date ?? now.date;
			time = value?.time ?? now.time;
			month = date.slice(0, 7);
			quick = quickWhens(timeZone);
		});
	});

	const cells = $derived.by(() => {
		if (!month) return [];
		const first = `${month}-01`;
		const startDow = new Date(first + 'T12:00:00Z').getUTCDay();
		const out: (string | null)[] = Array(startDow).fill(null);
		for (let d = first; d.startsWith(month); d = addDays(d, 1)) out.push(d);
		return out;
	});

	const monthLabel = $derived(
		month
			? new Date(month + '-15T12:00:00Z').toLocaleDateString('en-US', {
					month: 'long',
					year: 'numeric',
					timeZone: 'UTC'
				})
			: ''
	);

	function shiftMonth(n: number) {
		const [y, m] = month.split('-').map(Number);
		const d = new Date(Date.UTC(y, m - 1 + n, 1));
		month = d.toISOString().slice(0, 7);
	}

	const canNext = $derived(month < today.slice(0, 7));
	// checked against the clock whenever the choice changes, not when the page loaded
	const isFuture = $derived.by(() => {
		const now = utcToZoned(new Date(), timeZone);
		return date > now.date || (date === now.date && time > now.time);
	});

	const dayLabel = (d: string) =>
		new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

	const useLabel = $derived(date && time ? `Use ${whenLabel({ date, time })}` : 'Use');
</script>

<Sheet bind:open label="When?" width={420}>
	<div class="head">
		<h2>When?</h2>
		<button
			type="button"
			class="chip"
			onclick={() => {
				onselect(null);
				open = false;
			}}>Now</button
		>
	</div>

	<div class="quick" role="group" aria-label="Earlier">
		{#each quick as q (q.label)}
			<button
				type="button"
				class="chip"
				aria-label="{q.label}, {whenLabel(q.when)}"
				onclick={() => {
					onselect(q.when);
					open = false;
				}}>{q.label}</button
			>
		{/each}
	</div>

	<div class="cal">
		<div class="nav">
			<button type="button" class="btn-icon" aria-label="Previous month" onclick={() => shiftMonth(-1)}>‹</button>
			<div class="month">{monthLabel}</div>
			<button
				type="button"
				class="btn-icon"
				aria-label="Next month"
				disabled={!canNext}
				onclick={() => shiftMonth(1)}>›</button
			>
		</div>
		<div class="grid" role="group" aria-label={monthLabel}>
			{#each WEEKDAYS as w, i (i)}<div class="dow" aria-hidden="true">{w}</div>{/each}
			{#each cells as c, i (c ?? `blank-${i}`)}
				{#if c}
					<button
						type="button"
						class="day"
						class:selected={c === date}
						class:today={c === today}
						disabled={c > today}
						aria-pressed={c === date}
						aria-current={c === today ? 'date' : undefined}
						aria-label={dayLabel(c)}
						onclick={() => (date = c)}>{Number(c.slice(8))}</button
					>
				{:else}
					<div></div>
				{/if}
			{/each}
		</div>
	</div>

	<label class="time">
		<span>Time</span>
		<input type="time" class="time-box" bind:value={time} required />
	</label>

	<p class="note">Future dates are disabled for logs. Backdating is allowed.</p>

	<button
		type="button"
		class="btn btn-primary btn-lg use"
		disabled={isFuture || !date || !time}
		onclick={() => {
			onselect({ date, time });
			open = false;
		}}>{isFuture ? 'That time is in the future' : useLabel}</button
	>
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
	.head .chip {
		font-weight: 600;
	}
	.quick {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: -4px;
	}
	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 6px;
	}
	.nav .btn-icon {
		background: transparent;
		color: var(--text-2);
		font-size: 20px;
	}
	.nav .btn-icon:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.month {
		font-size: 16px;
		font-weight: 600;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px 2px;
	}
	.dow {
		text-align: center;
		font-size: 12px;
		color: var(--text-faint);
		padding-bottom: 4px;
	}
	/* G9: 40px pills; the hit area reaches 44px into the row gap */
	.day {
		position: relative;
		height: 40px;
		border-radius: 20px;
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}
	.day::after {
		content: '';
		position: absolute;
		inset: -2px 0;
	}
	.day.today {
		box-shadow: inset 0 0 0 1px var(--accent);
		color: var(--accent);
		font-weight: 700;
	}
	.day.selected {
		background: var(--accent);
		color: var(--on-accent);
		font-weight: 700;
		box-shadow: none;
	}
	.day:disabled {
		color: var(--placeholder);
		cursor: not-allowed;
	}
	@media (hover: hover) {
		.day:not(:disabled):not(.selected):hover {
			background: var(--surface-hi);
		}
	}
	.time {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		font-size: 14px;
		color: var(--text-muted);
	}
	.time-box {
		height: 46px;
		padding: 0 16px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		color: var(--text);
		font-size: 17px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.time-box:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	/* touch screens open their own time wheel; the clock icon only helps with a mouse */
	@media (pointer: coarse) {
		.time-box::-webkit-calendar-picker-indicator {
			display: none;
		}
	}
	.time-box::-webkit-calendar-picker-indicator {
		opacity: 0.6;
		cursor: pointer;
	}
	.note {
		margin: 0;
		font-size: 12px;
		color: var(--text-faint);
	}
	.use {
		height: 54px;
	}
</style>
