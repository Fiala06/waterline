<script lang="ts">
	// A step a reading suggests (#179), under it in Needs attention and on the
	// test's page: what and why, the step with a tap (never on its own), and
	// Don't suggest this, which switches the rule off for the tank, with Undo.
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { Suggestion } from '$lib/suggestions';

	let { s, tankId }: { s: Suggestion; tankId: string } = $props();
	const from = $derived(page.url.pathname + page.url.search);
</script>

<div class="suggest">
	<p class="s-text"><span class="kicker">Suggested step</span>{s.text}</p>
	<div class="s-acts">
		{#if 'action' in s}
			<form method="POST" action="/tanks/{tankId}/suggestions?/apply" use:enhance>
				<input type="hidden" name="rule" value={s.rule} />
				<input type="hidden" name="param" value={s.paramId} />
				<input type="hidden" name="from" value={from} />
				<button class="btn">{s.action.label}</button>
			</form>
		{:else}
			<a class="btn" href={s.link.href}>{s.link.label}</a>
		{/if}
		<form method="POST" action="/tanks/{tankId}/suggestions?/off" use:enhance>
			<input type="hidden" name="rule" value={s.rule} />
			<input type="hidden" name="from" value={from} />
			<button class="off">Don’t suggest this</button>
		</form>
	</div>
</div>

<style>
	.suggest {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 14px;
		border-left: 2px solid var(--accent);
		background: var(--surface);
	}
	.s-text {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 14px;
		line-height: 1.45;
	}
	.kicker {
		color: var(--accent-text);
	}
	.s-acts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 14px;
	}
	.s-acts .btn {
		min-height: 44px;
		padding: 0 16px;
		font-size: 14px;
		white-space: normal;
		text-align: left;
	}
	.off {
		min-height: 44px;
		padding: 0 4px;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-muted);
	}
	.off:hover {
		color: var(--text);
	}
</style>
