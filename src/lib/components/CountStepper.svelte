<script lang="ts">
	// − 10 + (G3): a count typed or stepped, kept between min and max.
	import { stepCount } from './event-form';

	let {
		id = 'count',
		name = 'count',
		value = $bindable(''),
		min = 0,
		max = null,
		invalid = false
	}: { id?: string; name?: string; value?: string; min?: number; max?: number | null; invalid?: boolean } = $props();

	const n = $derived(parseInt(value, 10));
	const step = (d: number) => (value = stepCount(value, d, min, max));
</script>

<div class="count-stepper stepper">
	<button type="button" aria-label="One fewer" disabled={!Number.isNaN(n) && n <= min} onclick={() => step(-1)}>−</button>
	<input {id} {name} inputmode="numeric" autocomplete="off" bind:value aria-invalid={invalid} />
	<button type="button" aria-label="One more" disabled={max != null && !Number.isNaN(n) && n >= max} onclick={() => step(1)}>+</button>
</div>

<style>
	.stepper {
		display: flex;
		width: 100%;
		height: 48px;
	}
	.stepper button {
		width: 48px;
		flex-shrink: 0;
		font-size: 22px;
	}
	.stepper input {
		flex: 1;
		align-self: stretch; /* the whole middle is the tap target */
		width: auto;
		min-width: 0;
		font-size: 18px;
		font-weight: 800;
	}
</style>
