<script lang="ts">
	// G5 · Observation: what was noticed.
	import { OBSERVATION_TAGS } from '$lib/events';

	let { tags = [], errors = {} }: { tags?: string[]; errors?: Record<string, string> } = $props();
</script>

<fieldset class="field">
	<legend class="label">What did you notice?</legend>
	<div class="chips">
		{#each OBSERVATION_TAGS as t (t)}
			<label class="chip pick"><input type="checkbox" name="tags" value={t} defaultChecked={tags.includes(t)} />{t}</label>
		{/each}
	</div>
	{#if errors.tags}<span class="error-text">✕ {errors.tags}</span>{/if}
</fieldset>
