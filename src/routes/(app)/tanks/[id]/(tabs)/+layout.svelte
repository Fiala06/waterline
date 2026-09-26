<script lang="ts">
	import { page } from '$app/state';
	import { photoUrl } from '$lib/media';
	let { data, children } = $props();
	const h = $derived(data.tankHead);
	const base = $derived(`/tanks/${h.id}`);
	const tabs = $derived([
		{ href: base, label: 'Overview' },
		{ href: `${base}/equipment`, label: 'Equipment' },
		{ href: `${base}/livestock`, label: 'Livestock' },
		{ href: `${base}/plants`, label: 'Plants' },
		{ href: `${base}/settings`, label: 'Settings' }
	]);
	const overview = $derived(page.url.pathname === base);
</script>

<div class="tank-page">
	{#if overview}
		<div class="cover" class:photo-placeholder={!h.cover}>
			{#if h.cover}<img src={photoUrl(h.cover, 'full')} alt="" />{:else}<span class="mono">cover photo</span>{/if}
		</div>
	{/if}
	<div class="head">
		<a class="back" href="/tanks">‹ Tanks</a>
		<h1>{h.name}{#if h.archived}<span class="archived">Archived</span>{/if}</h1>
		<p class="sub">{h.sub}{h.model ? ` · ${h.model}` : ''}{h.dims ? ` · ${h.dims}` : ''}</p>
		<nav class="tabs" aria-label="Tank sections">
			{#each tabs as t (t.href)}
				<a href={t.href} class:active={page.url.pathname === t.href} aria-current={page.url.pathname === t.href ? 'page' : undefined}>{t.label}</a>
			{/each}
		</nav>
	</div>
	{@render children()}
</div>

<style>
	.tank-page {
		display: flex;
		flex-direction: column;
		padding-bottom: calc(24px + env(safe-area-inset-bottom));
	}
	.cover {
		height: 180px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		color: var(--text-faint);
		overflow: hidden;
		border: none;
	}
	.cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.head {
		padding: 8px 20px 0;
		border-bottom: 1px solid var(--border);
	}
	h1 {
		margin: 4px 0 2px;
		font-size: 24px;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.archived {
		font-size: 12px;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 8px;
		background: var(--surface-hi);
		color: var(--text-muted);
	}
	.sub {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	.tabs {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		scrollbar-width: none;
		margin: 12px -20px 0;
		padding: 0 12px;
	}
	.tabs a {
		padding: 0 8px 12px;
		font-size: 15px;
		color: var(--text-muted);
		white-space: nowrap;
		border-bottom: 2px solid transparent;
		min-height: 36px;
		display: flex;
		align-items: flex-end;
	}
	.tabs a.active {
		color: var(--accent);
		font-weight: 600;
		border-bottom-color: var(--accent);
	}
	@media (min-width: 1024px) {
		.cover {
			display: none;
		}
		.head {
			padding: 24px 32px 0;
		}
		.back {
			display: none;
		}
		h1 {
			font-size: 26px;
		}
		.tabs {
			margin: 16px -8px 0;
			padding: 0;
		}
	}
</style>
