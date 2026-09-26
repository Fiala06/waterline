<script lang="ts">
	import { untrack } from 'svelte';
	// G9 · Date / time picker. Backdating is allowed; future dates are disabled.
	import Sheet from './Sheet.svelte';
	import { addDays, todayInZone, utcToZoned, whenLabel, type When } from '$lib/time';

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

	$effect(() => {
		if (!open) return;
		today = todayInZone(timeZone);
		const now = utcToZoned(new Date(), timeZone);
		date = value?.date ?? now.date;
		time = value?.time ?? now.time;
		month = date.slice(0, 7);
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
	const nowParts = $derived(utcToZoned(new Date(), timeZone));
	const isFuture = $derived(date > today || (date === today && time > nowParts.time));

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
						aria-label={c}
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
		<input type="time" class="input" bind:value={time} required />
	</label>

	<p class="note">Future dates are disabled for logs. Backdating is allowed.</p>

	<button
		type="button"
		class="btn btn-primary btn-lg"
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
	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}
	.nav .btn-icon:disabled {
		opacity: 0.35;
	}
	.month {
		font-size: 17px;
		font-weight: 600;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
	}
	.dow {
		text-align: center;
		font-size: 12px;
		color: var(--text-faint);
		padding: 4px 0;
	}
	.day {
		height: 44px;
		border-radius: 12px;
		font-size: 16px;
		font-variant-numeric: tabular-nums;
	}
	.day.today {
		box-shadow: inset 0 0 0 1px var(--border-strong);
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
	.time {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 15px;
		color: var(--text-muted);
	}
	.time .input {
		width: 160px;
		text-align: center;
	}
	.note {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
	}
</style>
