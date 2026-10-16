<script lang="ts">
	// Tank setup › Suggested steps (#179): the rules behind the steps a test can
	// suggest, with where each comes from, on or off for this tank.
	let { data } = $props();
</script>

<svelte:head><title>Suggested steps · {data.tank.name}</title></svelte:head>

<div class="page">
	<!-- phones; on desktop the header has the title -->
	<div class="bar hide-desk">
		<a class="cancel" href={data.from}>Cancel</a>
		<h1>Suggested steps</h1>
		<span aria-hidden="true"></span>
	</div>
	<form class="body" method="POST" action="?/save">
		<p class="lead">
			When a water test reads something keepers usually act on, its page and Needs attention suggest a step. Nothing happens until you tap it. The
			sources disagree on the details, so take them as suggestions; switch off any that don’t suit {data.tank.name}.
		</p>
		<div class="section-head"><h2>Suggest</h2></div>
		<div class="rows">
			{#each data.rules as r (r.id)}
				<label class="row">
					<input type="checkbox" name="rule" value={r.id} defaultChecked={r.on} />
					<span class="text">
						<strong>{r.name}</strong>
						<span class="when">{r.when}</span>
						<span class="step">→ {r.step}</span>
						<span class="source">Source: {r.source}</span>
					</span>
				</label>
			{/each}
		</div>
		<div class="foot">
			<button class="btn btn-primary">Save</button>
		</div>
	</form>
</div>

<style>
	.page {
		max-width: 560px;
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
		gap: 16px;
	}
	.lead {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.rows {
		display: flex;
		flex-direction: column;
		margin-top: -16px;
	}
	.row {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		padding: 14px 0;
		border-bottom: 1px solid var(--divider);
		cursor: pointer;
	}
	.row input {
		width: 22px;
		height: 22px;
		margin: 1px 0 0;
		flex-shrink: 0;
		accent-color: var(--accent);
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.text strong {
		font-size: 15px;
		font-weight: 700;
	}
	.when,
	.step {
		font-size: 14px;
	}
	.source {
		font-size: 13px;
		color: var(--text-muted);
	}
	.foot .btn {
		min-height: 44px;
		padding: 0 22px;
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
