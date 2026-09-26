<script lang="ts">
	// Settings shell: on desktop, one "Settings" heading and section menu for the
	// main page and its sub-pages (Export, Server). Phones use back links instead.
	import { page } from '$app/state';
	import { ui } from '$lib/ui.svelte';
	let { data, children } = $props();
	// Signing out clears this device, including entries still waiting to sync.
	const unsynced = $derived(ui.queue.length);

	const path = $derived(page.url.pathname);
	const items = $derived([
		{ href: '/settings#profile', label: 'Profile', active: path === '/settings' },
		{ href: '/settings#units', label: 'Units', active: false },
		{ href: '/settings#notifications', label: 'Notifications', active: false },
		{ href: '/settings#theme', label: 'Theme', active: false },
		{ href: '/settings/export', label: 'Export', active: path.startsWith('/settings/export') },
		...(data.user.isAdmin ? [{ href: '/settings/server', label: 'Server', admin: true, active: path.startsWith('/settings/server') }] : [])
	]);
</script>

<div class="shell">
	<h1 class="desk-title">Settings</h1>
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
				{#if unsynced}<p class="unsynced status-warn">▲ {unsynced} entr{unsynced === 1 ? 'y' : 'ies'} not synced yet</p>{/if}
			</form>
		</nav>
		<div class="content">{@render children()}</div>
	</div>
</div>

<style>
	.desk-title,
	.side {
		display: none;
	}
	@media (min-width: 1024px) {
		.shell {
			padding: 28px 32px;
		}
		.desk-title {
			display: block;
			margin: 0 0 20px;
			font-size: 28px;
			font-weight: 600;
		}
		.grid {
			display: grid;
			grid-template-columns: 200px minmax(0, 640px);
			gap: 32px;
			align-items: start;
		}
		.side {
			display: flex;
			flex-direction: column;
			gap: 2px;
			position: sticky;
			top: 24px;
		}
		.side a,
		.unsynced {
			margin: 4px 12px 0;
			font-size: 13px;
			font-weight: 600;
		}
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
			margin-top: 12px;
		}
		.badge {
			font-size: 11px;
			font-weight: 700;
			letter-spacing: 0.06em;
			text-transform: uppercase;
			padding: 2px 6px;
			border-radius: 6px;
			background: var(--selected);
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
