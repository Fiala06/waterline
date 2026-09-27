<script module lang="ts">
	/** "CF" for Cory Fiala, "A" for Admin; from the address when there's no name. */
	export function initialsOf(name: string, email = ''): string {
		const words = (name.trim() || email.split('@')[0] || '')
			.split(/[\s._-]+/)
			.filter(Boolean);
		if (!words.length) return '?';
		return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
	}
</script>

<script lang="ts">
	// Your account, from the upper left: a circle with your photo (or your
	// initials) that opens a menu to your settings, What's new and signing out.
	// A native popover, so it works without scripts.
	import { ui } from '$lib/ui.svelte';
	let { user, id }: { user: { displayName: string; email: string; isAdmin: boolean; avatar: string | null }; id: string } = $props();
	let menu = $state<HTMLElement>();
	const initials = $derived(initialsOf(user.displayName, user.email));
	const name = $derived(user.displayName || user.email);
	const close = () => menu?.hidePopover?.();
	// signing out clears this device, entries still waiting to sync included
	const unsynced = $derived(ui.queue.length);
</script>

<button type="button" class="avatar" popovertarget={id} aria-label="Account: {name}" title={name}>
	<span class="face">
		{#if user.avatar}<img src={user.avatar} alt="" />{:else}<span aria-hidden="true">{initials}</span>{/if}
	</span>
</button>

<div {id} popover class="menu" bind:this={menu}>
	<div class="who">
		<span class="face big" aria-hidden="true">
			{#if user.avatar}<img src={user.avatar} alt="" />{:else}{initials}{/if}
		</span>
		<span class="names">
			<strong>{user.displayName || 'Your account'}</strong>
			<span class="email">{user.email}</span>
		</span>
	</div>
	<nav class="links" aria-label="Account">
		<a href="/settings#profile" onclick={close}>Account settings</a>
		{#if user.isAdmin}<a href="/settings/server" onclick={close}>Server settings<span class="badge">Admin</span></a>{/if}
		<a href="/settings/changelog" onclick={close}>What's new</a>
	</nav>
	<form method="POST" action="/settings?/signout">
		<input type="hidden" name="redirectTo" value="/signin" />
		<button class="signout">Sign out</button>
		{#if unsynced}<p class="unsynced status-warn">▲ {unsynced} {unsynced === 1 ? "entry hasn't" : "entries haven't"} synced yet</p>{/if}
	</form>
</div>

<style>
	/* a 44px target around a 36px circle */
	.avatar {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
	}
	.face {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--selected);
		border: 1px solid var(--border);
		color: var(--accent);
		font-size: 14px;
		font-weight: 700;
		letter-spacing: 0.02em;
	}
	.face img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.face.big {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		font-size: 16px;
	}
	.avatar:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	@media (hover: hover) {
		.avatar:hover .face {
			border-color: var(--accent);
		}
	}

	/* the menu opens under the upper left corner */
	.menu {
		position: fixed;
		inset: auto;
		top: calc(env(safe-area-inset-top) + 64px);
		left: 16px;
		margin: 0;
		width: min(300px, calc(100vw - 32px));
		padding: 8px;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		box-shadow: var(--shadow-modal);
		color: var(--text);
	}
	.who {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 8px 12px;
		border-bottom: 1px solid var(--divider-soft);
	}
	.names {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.names strong {
		font-size: 15px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.email {
		font-size: 13px;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.links {
		display: flex;
		flex-direction: column;
		padding: 6px 0;
		border-bottom: 1px solid var(--divider-soft);
	}
	.links a,
	.signout {
		min-height: 44px;
		padding: 0 10px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-size: 15px;
		color: var(--text);
		width: 100%;
		text-align: left;
	}
	.badge {
		padding: 1px 6px;
		border-radius: 5px;
		border: 1px solid var(--border-strong);
		color: var(--text-muted);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	form {
		padding-top: 6px;
	}
	.signout {
		color: var(--bad-text);
		font-weight: 600;
	}
	.unsynced {
		margin: 2px 10px 6px;
		font-size: 13px;
	}
	@media (hover: hover) {
		.links a:hover,
		.signout:hover {
			background: var(--surface-hi);
		}
	}
</style>
