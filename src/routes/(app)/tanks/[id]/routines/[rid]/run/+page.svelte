<script lang="ts">
	// Running a routine (#92): the step up next, big, with Log and Skip; the
	// whole sequence under it with what's logged and skipped so far.
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	let { data } = $props();
	const MARK: Record<string, string> = { done: '✓ Logged', skipped: '– Skipped', next: '▲ Up next', later: '' };
</script>

<svelte:head><title>{data.routine.name} · {data.tank.name}</title></svelte:head>

<div class="page sub-page">
	<div class="phead">
		<a class="back sub-back hide-desk" href="/tanks/{data.tank.id}/routines">‹ Routines</a>
		<h1 class="title">{data.routine.name}</h1>
		<p class="summary">{data.summary}</p>
	</div>

	{#if data.current}
		<section class="now" aria-labelledby="now-h">
			<CategoryIcon kind={data.current.kind} size={44} />
			<div class="now-text">
				<h2 id="now-h">{data.current.label}</h2>
				<span class="now-sub">{[data.current.kindLabel, data.current.sub].filter(Boolean).join(' · ')}</span>
			</div>
			<div class="now-acts">
				<a class="btn btn-primary btn-lg" href={data.current.logHref}>Log it ›</a>
				<a class="btn btn-lg" href={data.current.skipHref}>Skip</a>
			</div>
			<p class="hint">Log it opens the form filled in; Save brings you back here for the next step.</p>
		</section>
	{:else}
		<section class="over" aria-labelledby="over-h">
			<h2 id="over-h">✓ Routine done</h2>
			<p>{data.logged} step{data.logged === 1 ? '' : 's'} logged{data.skipped ? `, ${data.skipped} skipped` : ''}. Each logged step is in History.</p>
			<div class="now-acts">
				<a class="btn btn-primary" href="/?tank={data.tank.id}">Back to {data.tank.name}</a>
				<a class="btn" href="/history?tank={data.tank.id}">History ›</a>
				<a class="btn-text" href={data.againHref}>Run again</a>
			</div>
		</section>
	{/if}

	<section class="all" aria-label="Steps">
		<div class="section-head"><h2>Steps</h2><span class="meta">{data.steps.length}</span></div>
		<ol>
			{#each data.steps as s, i (i)}
				<li class={s.status}>
					<span class="n">{i + 1}</span>
					<span class="s-label">{s.label}</span>
					<span class="s-status">{MARK[s.status]}</span>
				</li>
			{/each}
		</ol>
	</section>
</div>

<style>
	.page {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 22px;
		max-width: 640px;
	}
	.phead {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.title {
		margin: 0;
		font-size: 28px;
	}
	.summary {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
		font-weight: 700;
	}
	/* the step up next: icon, name, the two actions, under a 2px rule */
	.now,
	.over {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-top: 16px;
		border-top: 2px solid var(--ink);
	}
	.now-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.now h2,
	.over h2 {
		margin: 0;
		font-size: 24px;
	}
	.over p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
	}
	.now-sub {
		font-size: 14px;
		color: var(--text-muted);
	}
	.now-acts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.now-acts .btn-primary {
		flex: 1;
	}
	.hint {
		margin: 0;
	}
	.all ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.all li {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 48px;
		padding: 6px 0;
		border-bottom: 1px solid var(--divider);
	}
	.n {
		width: 20px;
		font-size: 13px;
		font-weight: 800;
		color: var(--text-muted);
		text-align: right;
	}
	.s-label {
		flex: 1;
		font-size: 15px;
	}
	li.next .s-label {
		font-weight: 800;
	}
	li.done .s-label,
	li.skipped .s-label {
		color: var(--text-muted);
	}
	.s-status {
		font-size: 12px;
		font-weight: 800;
		color: var(--text-muted);
	}
	li.next .s-status {
		color: var(--accent-text);
	}
	@media (min-width: 1024px) {
		.title {
			font-size: 22px;
		}
		.now-acts .btn-primary {
			flex: none;
			padding: 0 28px;
		}
	}
</style>
