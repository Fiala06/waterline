<script lang="ts">
	// The last few times a task was done or skipped (#164), under its form:
	// a kicker over a 2px ink rule, then a row each, opening its History entry.
	import { fmtDate } from '$lib/time';

	let { done }: { done: { id: string; date: string; skipped: boolean; eventId: string | null }[] } = $props();
</script>

<section class="log" aria-label="Last done">
	<span class="kicker rule">Last done{done.length ? ` · ${done.length}` : ''}</span>
	{#each done as c (c.id)}
		{#if c.eventId}
			<a class="log-row" href="/entries/event/{c.eventId}"><b>{c.skipped ? 'Skipped' : 'Done'}</b><span class="day">{fmtDate(c.date)}</span></a>
		{:else}
			<span class="log-row"><b>{c.skipped ? 'Skipped' : 'Done'}</b><span class="day">{fmtDate(c.date)}</span></span>
		{/if}
	{/each}
	{#if !done.length}<span class="none">Not done yet.</span>{/if}
</section>

<style>
	.log {
		display: flex;
		flex-direction: column;
		margin-top: 28px;
	}
	.rule {
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
	}
	.log-row {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		min-height: 44px;
		align-items: center;
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
		color: var(--text);
	}
	.log-row b {
		font-weight: 600;
	}
	.day {
		color: var(--text-muted);
		white-space: nowrap;
	}
	@media (hover: hover) {
		a.log-row:hover b {
			color: var(--accent-text);
		}
	}
	.none {
		padding: 10px 0;
		font-size: 13px;
		color: var(--text-muted);
	}
</style>
