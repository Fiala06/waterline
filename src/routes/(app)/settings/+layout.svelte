<script lang="ts">
	// Settings shell: on desktop, one "Settings" heading and section menu for the
	// main page and its sub-pages (Products, Export, AI assistant, What's new, Server),
	// with Server's own parts under it. Phones use back links instead. Signing
	// out is in the account menu, under your photo.
	import { page } from '$app/state';
	import { SERVER_SECTIONS, SETTINGS_SECTIONS } from '$lib/settings-sections';
	let { data, children } = $props();

	const path = $derived(page.url.pathname);
	// the page whose parts the menu follows as you scroll (D9)
	const parts = $derived(path === '/settings' ? SETTINGS_SECTIONS : path === '/settings/server' ? SERVER_SECTIONS : null);
	let section = $state('');
	$effect(() => {
		if (!parts) return;
		const ids = parts.map((p) => p.id);
		const onScroll = () => {
			let current = ids[0];
			for (const id of ids) {
				const top = document.getElementById(id)?.getBoundingClientRect().top;
				if (top != null && top < 160) current = id;
			}
			// the last section can be too short to reach the top
			if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) current = ids.at(-1)!;
			section = current;
		};
		onScroll();
		addEventListener('scroll', onScroll, { passive: true });
		return () => removeEventListener('scroll', onScroll);
	});
	const on = (id: string) => path === '/settings' && section === id;
	const items = $derived([
		...SETTINGS_SECTIONS.map((s) => ({ href: `/settings#${s.id}`, label: s.label, active: on(s.id) })),
		{ href: '/settings/products', label: 'Products', active: path.startsWith('/settings/products') },
		{ href: '/settings/export', label: 'Import & export', active: path.startsWith('/settings/export') },
		{ href: '/settings/assistant', label: 'AI assistant', active: path.startsWith('/settings/assistant') },
		{ href: '/settings/changelog', label: "What's new", active: path.startsWith('/settings/changelog') },
		...(data.user.isAdmin ? [{ href: '/settings/server', label: 'Server', admin: true, active: path.startsWith('/settings/server') }] : [])
	]);
</script>

<div class="shell">
	<div class="grid">
		<nav class="side" aria-label="Settings sections">
			{#each items as it (it.href)}
				<a href={it.href} class:active={it.active} aria-current={it.active ? 'page' : undefined}>
					{it.label}{#if 'admin' in it}<span class="badge">Admin</span>{/if}
				</a>
				{#if 'admin' in it && path.startsWith('/settings/server')}
					<!-- Server's parts, each its own address -->
					{#each SERVER_SECTIONS as sec (sec.id)}
						<a
							class="sub"
							href="/settings/server#{sec.id}"
							class:current={path === '/settings/server' && section === sec.id}
							aria-current={path === '/settings/server' && section === sec.id ? 'location' : undefined}>{sec.label}</a
						>
					{/each}
				{/if}
			{/each}
		</nav>
		<div class="content">{@render children()}</div>
	</div>
</div>

<style>
	.side {
		display: none;
	}
	/* D9: a full-height section menu with Sign out at the bottom, content beside it */
	@media (min-width: 1024px) {
		.grid {
			position: relative;
			display: grid;
			grid-template-columns: 220px minmax(0, 1fr);
			min-height: calc(100dvh - 72px);
		}
		.grid::before {
			content: '';
			position: absolute;
			top: 0;
			bottom: 0;
			left: 219px;
			width: 1px;
			background: var(--border);
		}
		.side {
			display: flex;
			flex-direction: column;
			gap: 2px;
			position: sticky;
			top: 0;
			height: calc(100dvh - 72px);
			overflow-y: auto;
			padding: 24px 14px;
		}
		.content {
			min-width: 0;
			max-width: 800px;
			padding: 28px 36px 48px;
		}
		.side a {
			height: 40px;
			padding: 0 12px;
			border-radius: 10px;
			display: flex;
			align-items: center;
			gap: 8px;
			color: var(--text-2);
			font-size: 15px;
			width: 100%;
			text-align: left;
		}
		.side a {
			justify-content: space-between;
		}
		.side a:hover {
			background: var(--surface);
		}
		.side a.active {
			background: var(--selected);
			color: var(--accent);
			font-weight: 600;
		}
		/* Server's parts, under it */
		.side a.sub {
			height: 36px;
			padding-left: 26px;
			font-size: 14px;
			color: var(--text-muted);
		}
		.side a.sub.current {
			color: var(--accent);
			font-weight: 600;
		}
		.badge {
			font-size: 12px;
			font-weight: 700;
			letter-spacing: 0.06em;
			text-transform: uppercase;
			padding: 1px 6px;
			border-radius: 6px;
			border: 1px solid var(--border-strong);
			color: var(--text-muted);
		}
		.active .badge {
			border-color: var(--accent);
			color: var(--accent);
		}
		/* sub-pages: the shell provides the heading, menu and padding */
		.content :global(.sub-back) {
			display: none;
		}
		.content :global(.sub-page) {
			padding: 0 !important;
			max-width: none !important;
		}
		.content :global(.sub-page h1) {
			font-size: 22px;
		}
	}
</style>
