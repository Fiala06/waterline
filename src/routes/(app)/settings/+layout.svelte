<script lang="ts">
	// Settings shell: on desktop, one "Settings" heading and section menu for the
	// main page and its sub-pages (Export, Server). Phones use back links instead.
	import { page } from '$app/state';
	import { ui } from '$lib/ui.svelte';
	let { data, children } = $props();
	// Signing out clears this device, including entries still waiting to sync.
	const unsynced = $derived(ui.queue.length);

	const path = $derived(page.url.pathname);
	// On the settings page, light up the section being read (D9).
	let section = $state('profile');
	$effect(() => {
		if (path !== '/settings') return;
		const ids = ['profile', 'units', 'notifications', 'theme'];
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
		{ href: '/settings#profile', label: 'Profile', active: on('profile') },
		{ href: '/settings#units', label: 'Units', active: on('units') },
		{ href: '/settings#notifications', label: 'Notifications', active: on('notifications') },
		{ href: '/settings#theme', label: 'Theme', active: on('theme') },
		{ href: '/settings/export', label: 'Export', active: path.startsWith('/settings/export') },
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
			{/each}
			<form method="POST" action="/settings?/signout">
				<input type="hidden" name="redirectTo" value="/signin" />
				<button class="signout">Sign out</button>
				{#if unsynced}<p class="unsynced status-warn">▲ {unsynced} {unsynced === 1 ? "entry hasn't" : "entries haven't"} synced yet</p>{/if}
			</form>
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
		.side form {
			margin-top: auto;
		}
		.content {
			min-width: 0;
			max-width: 800px;
			padding: 28px 36px 48px;
		}
		.side a,
		.signout {
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
		.side a:hover,
		.signout:hover {
			background: var(--surface);
		}
		.side a.active {
			background: var(--selected);
			color: var(--accent);
			font-weight: 600;
		}
		.signout {
			color: var(--bad);
		}
		.unsynced {
			margin: 4px 12px 0;
			font-size: 13px;
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
