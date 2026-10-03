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
				: 'This page swam off.'
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
	// a page of the app that isn't there: its fish has left the tank
	const swamOff = $derived(status === 404 && !isPublic);
	// what went wrong is in the log under this reference
	const ref = $derived(status >= 500 ? page.error?.ref : undefined);
</script>

<svelte:head><title>{title} · Waterline</title></svelte:head>

<main class="err">
	{#if swamOff}
		<div class="tank" aria-hidden="true">
			<span class="water"></span>
			<span class="bubble b1"></span><span class="bubble b2"></span>
			<svg class="fish" viewBox="0 0 64 36">
				<path d="M44 18c0 7-10 14-22 14S2 25 2 18 10 4 22 4s22 7 22 14z" />
				<path d="M42 18 62 5v26z" />
				<circle cx="13" cy="15" r="2.6" class="eye" />
			</svg>
		</div>
	{:else}
		<Logo size={56} />
	{/if}
	<p class="code kicker">{status}</p>
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
	/* 404: a tank whose fish is on its way out of the frame */
	.tank {
		position: relative;
		width: 168px;
		height: 104px;
		border-radius: 0;
		border: 3px solid var(--text);
		overflow: hidden;
	}
	.water {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 62%;
		background: var(--accent);
		opacity: 0.35;
	}
	.fish {
		position: absolute;
		left: 64px;
		top: 40px;
		width: 56px;
		fill: var(--accent);
		animation: swim-off 2.8s ease-in 0.4s forwards;
	}
	.fish .eye {
		fill: var(--bg);
	}
	.bubble {
		position: absolute;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		border: 1.5px solid var(--text-muted);
		opacity: 0;
		animation: rise 2.4s ease-out infinite;
	}
	.b1 {
		left: 120px;
		top: 60px;
	}
	.b2 {
		left: 104px;
		top: 70px;
		animation-delay: 1.1s;
	}
	@keyframes swim-off {
		30% {
			transform: translate(10px, -3px);
		}
		100% {
			transform: translate(-150px, 6px);
		}
	}
	@keyframes rise {
		15% {
			opacity: 0.9;
		}
		100% {
			opacity: 0;
			transform: translateY(-46px);
		}
	}
	/* no motion: the fish half out of the frame, mid-escape */
	@media (prefers-reduced-motion: reduce) {
		.fish {
			animation: none;
			transform: translateX(-84px);
		}
		.bubble {
			animation: none;
			opacity: 0.7;
			transform: translateY(-20px);
		}
	}
	.err {
		min-height: 100dvh;
		max-width: 480px;
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
		font-weight: 800;
		color: var(--accent-700);
	}
	h1 {
		margin: 0;
		font-size: 32px;
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
