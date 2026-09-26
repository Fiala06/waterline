<svelte:head><title>History · Waterline</title></svelte:head>

<div class="page">
	<h1>History</h1>
	<div class="card soon">
		<strong>Coming in milestone 6</strong>
		<span class="muted">History is part of the next build step. Recent activity and trends are on the dashboard for now.</span>
		<a href="/">Back to dashboard</a>
	</div>
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: 600px;
	}
	h1 {
		margin: 8px 0 0;
		font-size: 28px;
		font-weight: 600;
	}
	.soon {
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
		}
	}
</style>
