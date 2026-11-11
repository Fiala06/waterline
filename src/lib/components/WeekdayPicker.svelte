<script lang="ts">
	// On these days: seven toggles, Mon first (a task's set days, a doser's dose)
	import { WEEKDAYS } from '$lib/tasks';

	let {
		name,
		value = $bindable(),
		invalid = false,
		labelSuffix = ''
	}: {
		name: string;
		value: number[];
		invalid?: boolean;
		/** added to each day's label: "Monday, dose 1" */
		labelSuffix?: string;
	} = $props();
</script>

<div class="week" class:invalid>
	{#each WEEKDAYS as w (w.day)}
		<label class="day" title={w.name}>
			<input type="checkbox" {name} value={w.day} bind:group={value} aria-label={labelSuffix ? `${w.name}, ${labelSuffix}` : w.name} />
			<span aria-hidden="true">{w.short}</span>
		</label>
	{/each}
</div>

<style>
	.week {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 6px;
	}
	.day {
		position: relative;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0;
		border: 1px solid var(--border);
		background: var(--surface);
		font-size: 14px;
		font-weight: 600;
		color: var(--text-muted);
		cursor: pointer;
	}
	.day input {
		position: absolute;
		inset: 0;
		opacity: 0;
		margin: 0;
		cursor: pointer;
	}
	.day:has(input:checked) {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}
	.day:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.week.invalid .day {
		border-color: var(--bad);
	}
</style>
