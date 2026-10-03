<script lang="ts">
	// A test kit's steps under a parameter on the water test form (#21): Start
	// walks the steps, each timed one with a countdown that keeps going while
	// the other readings are typed in, and a chime and a buzz when time's up.
	import { onDestroy } from 'svelte';
	import { buzz, chime, keepAwake, primeAudio } from '$lib/kit-timer';
	import { fmtClock, fmtDuration, kitSeconds, type KitStep } from '$lib/kits';
	import { toast } from '$lib/ui.svelte';

	let {
		kit,
		paramName,
		onstate
	}: {
		kit: { name: string; steps: KitStep[] };
		paramName: string;
		/** what the row's flag shows: a countdown, "time's up", or nothing */
		onstate?: (s: { running: boolean; clock: string | null; done: boolean }) => void;
	} = $props();

	let open = $state(false);
	let step = $state(-1); // the step being done; -1 before Start
	let remaining = $state(0);
	let endsAt = 0;
	let tick: ReturnType<typeof setInterval> | null = null;
	let counting = $state(false); // a timed step's countdown is running
	let release: (() => void) | null = null;
	let finished = $state(false);
	const total = $derived(kitSeconds(kit));
	const current = $derived(step >= 0 ? kit.steps[step] : null);
	const timing = $derived(!!current?.seconds && counting);

	function report() {
		onstate?.({ running: step >= 0 && !finished, clock: timing ? fmtClock(remaining) : null, done: finished });
	}

	function stopTimer() {
		if (tick) clearInterval(tick);
		tick = null;
		counting = false;
		release?.();
		release = null;
	}

	function start() {
		primeAudio();
		open = true;
		finished = false;
		goTo(0);
	}

	/** Move to a step: a timed one starts its countdown; past the last, the kit is done. */
	function goTo(i: number) {
		stopTimer();
		if (i >= kit.steps.length) {
			step = kit.steps.length;
			finished = true;
			report();
			return;
		}
		step = i;
		const s = kit.steps[i];
		if (s.seconds) {
			remaining = s.seconds;
			endsAt = Date.now() + s.seconds * 1000;
			release = keepAwake();
			counting = true;
			tick = setInterval(() => {
				remaining = (endsAt - Date.now()) / 1000;
				if (remaining <= 0) {
					stopTimer();
					remaining = 0;
					chime();
					buzz();
					toast(`⏱ ${paramName}: ${s.text.replace(/\s+\d.*$/, '').toLowerCase() === 'wait' ? "time's up" : `${s.text} done`}`);
					// the next step waits for a tap: nobody's watching the screen at the end of a 5-minute wait
				}
				report();
			}, 250);
		}
		report();
	}

	function reset() {
		stopTimer();
		step = -1;
		finished = false;
		report();
	}
	onDestroy(stopTimer);
</script>

<div class="kit" class:open>
	{#if step < 0}
		<button type="button" class="start" onclick={start} aria-label="Start {kit.name}{total ? `, ${fmtDuration(total)}` : ''}"
			>▶ Start{#if total}<span class="takes"> · {fmtDuration(total)}</span>{/if}</button
		>
		<button type="button" class="btn-text steps-toggle" aria-expanded={open} onclick={() => (open = !open)}>{open ? 'Hide steps' : 'Steps'}</button>
	{:else}
		<button type="button" class="btn-text steps-toggle" aria-expanded={open} onclick={() => (open = !open)}>{open ? 'Hide steps' : `Step ${Math.min(step + 1, kit.steps.length)} of ${kit.steps.length}`}</button>
		<button type="button" class="btn-text reset" onclick={reset}>Reset</button>
	{/if}
	{#if open}
		<ol class="steps" aria-label="{kit.name} steps">
			{#each kit.steps as s, i (i)}
				<li class:now={i === step} class:done={i < step || finished}>
					<span class="s-text">{s.text}</span>
					{#if i === step && !finished}
						{#if s.seconds && counting}
							<span class="clock" role="timer" aria-live="off">{fmtClock(remaining)}</span>
							<button type="button" class="btn next" onclick={() => goTo(i + 1)}>Skip</button>
						{:else if s.seconds && remaining === 0 && step === i}
							<span class="clock up">✓ Time's up</span>
							<button type="button" class="btn btn-primary next" onclick={() => goTo(i + 1)}>Next</button>
						{:else}
							<button type="button" class="btn btn-primary next" onclick={() => goTo(i + 1)}>{i === kit.steps.length - 1 ? 'Done' : 'Next'}</button>
						{/if}
					{/if}
				</li>
			{/each}
		</ol>
		{#if finished}<span class="finished">✓ Done · type the reading above</span>{/if}
	{/if}
</div>

<style>
	.kit {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 14px;
		margin-top: 4px;
	}
	.start {
		display: inline-flex;
		align-items: center;
		min-height: 36px;
		padding: 0 10px;
		border: 1px solid var(--divider);
		font-size: 13px;
		font-weight: 800;
		color: var(--accent-text);
	}
	.takes {
		font-weight: 400;
		color: var(--text-muted);
	}
	@media (hover: hover) {
		.start:hover {
			border-color: var(--accent);
		}
	}
	.steps-toggle,
	.reset {
		min-height: 36px;
		padding: 0;
		font-size: 13px;
	}
	.reset {
		color: var(--text-muted);
	}
	.steps {
		flex-basis: 100%;
		margin: 2px 0 4px;
		padding: 0 0 0 20px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 14px;
	}
	.steps li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
		min-height: 32px;
		padding: 2px 6px 2px 4px;
		color: var(--text-2);
	}
	.steps li.done {
		color: var(--text-muted);
		text-decoration: line-through;
	}
	.steps li.now {
		color: var(--text);
		font-weight: 700;
		background: var(--surface);
	}
	.s-text {
		flex: 1 1 160px;
	}
	.clock {
		font-size: 17px;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.clock.up {
		color: var(--accent-text);
	}
	.next {
		min-height: 36px;
		padding: 0 12px;
		font-size: 13px;
	}
	.finished {
		flex-basis: 100%;
		font-size: 13px;
		font-weight: 700;
	}
</style>
