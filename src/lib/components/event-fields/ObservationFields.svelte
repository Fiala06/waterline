<script lang="ts">
	// An observation (G5): what was noticed. Its "Remind me to check again" is EventForm's, after the photos.
	import { OBSERVATION_TAGS } from '$lib/events';
	import { listOf, type FormValues } from '../event-form';

	let { values, errors }: { values: FormValues; errors: Record<string, string> } = $props();
</script>

<fieldset class="field">
	<legend class="label">What did you notice?</legend>
	<div class="chips">
		{#each OBSERVATION_TAGS as t (t)}
			<label class="chip pick"><input type="checkbox" name="tags" value={t} defaultChecked={listOf(values, 'tags').includes(t)} />{t}</label>
		{/each}
	</div>
	{#if errors.tags}<span class="error-text">✕ {errors.tags}</span>{/if}
</fieldset>

<style>
	legend {
		margin-bottom: 8px;
	}
	/* ── Pick-any chips ── */
	.pick {
		height: 40px;
	}

	@media (min-width: 1024px) {
		legend {
			margin-bottom: 6px;
		}
	}
</style>
