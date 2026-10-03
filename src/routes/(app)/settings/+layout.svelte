<script lang="ts">
	// Settings shell (redesign README § 15): on desktop a 200px menu of sections
	// beside the content, under the shell's "Settings" title. Each row is 40px;
	// the one in view has a surface background and 800 weight, and a right-aligned
	// badge where the data is at hand (the theme, counts, ADMIN, a newer version).
	// Phones use back links instead. Signing out is under Account, and in the
	// account menu.
	import { page } from '$app/state';
	import { SERVER_SECTIONS, SETTINGS_MENU, SETTINGS_SECTIONS } from '$lib/settings-sections';
	let { data, children } = $props();

	const path = $derived(page.url.pathname);
	// the page whose parts the menu follows as you scroll
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
	const themeWord = $derived(data.user.theme === 'dark' ? 'Dark' : data.user.theme === 'light' ? 'Light' : 'System');
	// counts the settings page already loads; blank elsewhere
	const count = (k: 'products' | 'assistants' | 'kits') => {
		const n = page.data[k];
		return typeof n === 'number' && n > 0 ? String(n) : '';
	};
	type Item = { href: string; label: string; active: boolean; badge?: string; admin?: boolean; accent?: boolean };
	const items = $derived<Item[]>([
		...SETTINGS_MENU.map((s) => ({
			href: `/settings#${s.id}`,
			label: s.label,
			active: on(s.id),
			badge: s.id === 'theme' ? themeWord : ''
		})),
		{ href: '/settings/products', label: 'Products', active: path.startsWith('/settings/products'), badge: count('products') },
		{ href: '/settings/test-kits', label: 'Test kits', active: path.startsWith('/settings/test-kits'), badge: count('kits') },
		{ href: '/settings/export', label: 'Import & export', active: path.startsWith('/settings/export') },
		{ href: '/settings/assistant', label: 'AI assistant', active: path.startsWith('/settings/assistant'), badge: count('assistants') },
		...(data.user.isAdmin ? [{ href: '/settings/server', label: 'Server', admin: true, badge: 'ADMIN', active: path.startsWith('/settings/server') }] : []),
		{ href: '/settings/changelog', label: "What's new", active: path.startsWith('/settings/changelog'), badge: data.app.update?.version ?? '', accent: !!data.app.update },
		{ href: '/settings#account', label: 'Account', active: on('account') }
	]);
</script>

<div class="shell">
	<div class="grid">
		<nav class="side" aria-label="Settings sections">
			{#each items as it (it.href)}
				<a href={it.href} class:active={it.active} aria-current={it.active ? 'page' : undefined}>
					<span>{it.label}</span>
					{#if it.badge}<span class="badge" class:accent={it.accent}>{it.badge}</span>{/if}
				</a>
				{#if it.admin && path.startsWith('/settings/server')}
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
	@media (min-width: 1024px) {
		.shell {
			padding: 22px 32px 48px;
		}
		.grid {
			display: grid;
			grid-template-columns: 200px minmax(0, 1fr);
		}
		.side {
			display: flex;
			flex-direction: column;
			align-self: start;
			position: sticky;
			top: 0;
			max-height: 100dvh;
			overflow-y: auto;
			padding: 0 16px 32px 0;
			border-right: 2px solid var(--divider);
		}
		.content {
			min-width: 0;
			max-width: 820px;
			padding: 0 0 0 32px;
		}
		.side a {
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 8px;
			height: 40px;
			padding: 0 8px;
			color: var(--text);
			font-size: 14px;
			text-align: left;
		}
		.side a:hover {
			background: var(--surface);
			color: var(--text);
		}
		.side a.active {
			background: var(--surface);
			font-weight: 800;
		}
		.badge {
			font-size: 11px;
			font-weight: 800;
			letter-spacing: 0.02em;
			color: var(--text-muted);
			white-space: nowrap;
		}
		.badge.accent {
			color: var(--accent-700);
		}
		/* Server's parts, under it */
		.side a.sub {
			height: 32px;
			padding-left: 20px;
			font-size: 13px;
			color: var(--text-muted);
		}
		.side a.sub.current {
			color: var(--text);
			font-weight: 800;
		}
		/* sub-pages: the shell provides the heading, menu and padding */
		.content :global(.sub-back) {
			display: none;
		}
		.content :global(.sub-page) {
			padding: 0 !important;
			max-width: none !important;
		}
	}
	/* the main area is narrow: a 168px menu */
	@media (min-width: 1024px) and (max-width: 1100px) {
		.grid {
			grid-template-columns: 168px minmax(0, 1fr);
		}
		.side {
			padding-right: 10px;
		}
		.content {
			padding-left: 24px;
		}
	}
</style>
