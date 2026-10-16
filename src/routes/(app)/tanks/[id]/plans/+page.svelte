<script lang="ts">
	// Treatment plans (#177): pick a starter (edited before it starts), and the tank's plans.
	let { data } = $props();
	const startHref = (key: string) => `/tanks/${data.tank.id}/plans/new?t=${key}${data.entry ? `&entry=${data.entry}` : ''}`;
</script>

<svelte:head><title>Treatment plans · {data.tank.name}</title></svelte:head>

<div class="page">
	<div class="bar hide-desk">
		<a class="cancel" href={data.from}>Back</a>
		<h1>Treatment plans</h1>
		<span aria-hidden="true"></span>
	</div>
	<div class="body">
		<p class="hint">
			A plan sets up its steps as tasks with their own dates, and holds back the routines it needs to. Each starter is a place to begin: change it to suit the tank before it starts.
		</p>

		{#if data.plans.running.length}
			<section aria-label="Running">
				<h2 class="kicker rule">Running</h2>
				{#each data.plans.running as p (p.id)}
					<a class="row" href="/tanks/{data.tank.id}/plans/{p.id}"><b>{p.name}</b><span class="meta">{p.status}</span></a>
				{/each}
			</section>
		{/if}

		<section aria-label="Start a plan">
			<h2 class="kicker rule">Start a plan</h2>
			{#each data.templates as t (t.key)}
				<a class="row tpl" href={startHref(t.key)}>
					<span class="top"><b>{t.name}</b><span class="meta">{t.days} days ›</span></span>
					<span class="lead">{t.lead}</span>
				</a>
			{/each}
		</section>

		{#if data.plans.past.length}
			<section aria-label="Past plans">
				<h2 class="kicker rule">Past</h2>
				{#each data.plans.past as p (p.id)}
					<a class="row" href="/tanks/{data.tank.id}/plans/{p.id}"><b>{p.name}</b><span class="meta">{p.status} · from {p.startedOn}</span></a>
				{/each}
			</section>
		{/if}
	</div>
</div>

<style>
	.page {
		max-width: 640px;
	}
	.bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 8px 20px;
	}
	.cancel {
		font-size: 15px;
		color: var(--text-muted);
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-self: start;
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
	}
	.body {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.hint {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
	}
	section {
		display: flex;
		flex-direction: column;
	}
	.rule {
		margin: 0;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		min-height: 52px;
		padding: 8px 0;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	.row b {
		font-weight: 600;
	}
	.tpl {
		flex-direction: column;
		align-items: stretch;
		gap: 4px;
		padding: 12px 0;
	}
	.top {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	.meta {
		font-size: 13px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.lead {
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-2);
	}
	@media (hover: hover) {
		.row:hover b {
			color: var(--accent-text);
		}
	}
	@media (min-width: 1024px) {
		.page {
			max-width: 880px;
			padding: 24px 32px 48px;
		}
		.body {
			padding: 0;
			max-width: 640px;
		}
	}
</style>
