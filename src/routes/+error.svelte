<script lang="ts">
	// Error page for every route: a friendly message and a way back.
	import { page } from '$app/state';
	import Logo from '$lib/components/Logo.svelte';

	const status = $derived(page.status);
	const isPublic = $derived(/^\/(t|s|p|public)(\/|$)/.test(page.url.pathname));
	const title = $derived(
		status === 404
			? isPublic
				? "This page isn't available"
				: 'Page not found'
			: status === 403
				? "You can't do that here"
				: status === 410
					? 'This link has expired'
					: 'Something went wrong'
	);
	const detail = $derived(
		status === 404
			? isPublic
				? 'It may have been unpublished, or the link is mistyped.'
				: 'The link may be old, or the entry was deleted.'
			: status >= 500
				? 'Please try again. If it keeps happening, the server log has the details.'
				: (page.error?.message ?? '')
	);
	// what went wrong is in the log under this reference
	const ref = $derived(status >= 500 ? page.error?.ref : undefined);
</script>

<svelte:head><title>{title} · Waterline</title></svelte:head>

<main class="err">
	<Logo size={56} />
	<p class="code mono">{status}</p>
	<h1>{title}</h1>
	{#if detail}<p class="muted">{detail}</p>{/if}
	{#if ref}<p class="ref">Reference <span class="mono">{ref}</span>: the admin can look it up in Settings › Server settings › Logs.</p>{/if}
	<div class="actions">
		{#if isPublic}
			<a class="btn btn-primary" href="/">Go to Waterline</a>
		{:else}
			<a class="btn btn-primary" href="/">Back to dashboard</a>
			<button type="button" class="btn" onclick={() => history.back()}>Go back</button>
		{/if}
	</div>
</main>

<style>
	.ref {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-faint);
	}
	.ref .mono {
		color: var(--text-muted);
		user-select: all;
	}
	.err {
		min-height: 100dvh;
		max-width: 440px;
		margin: 0 auto;
		padding: 48px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: 12px;
	}
	.code {
		margin: 8px 0 0;
		font-size: 13px;
		color: var(--text-faint);
		letter-spacing: 0.1em;
	}
	h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 600;
	}
	p {
		margin: 0;
		line-height: 1.5;
	}
	.actions {
		display: flex;
		gap: 10px;
		margin-top: 12px;
		flex-wrap: wrap;
		justify-content: center;
	}
</style>
