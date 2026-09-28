<script lang="ts">
	// Dashboard refresh (1c): the tank's cover photo, full bleed, fading into the
	// page so the name sits on the photo. Tap the name to switch tanks (G1), or
	// swipe left or right on it for the next or previous one. Under it, the
	// waterline: the screen's one decorative line.
	import type { ComponentProps } from 'svelte';
	import { goto } from '$app/navigation';
	import { photoUrl } from '$lib/media';
	import { daysBetween } from '$lib/time';
	import { tankTypeLabel } from '$lib/types';
	import { ui } from '$lib/ui.svelte';
	import AccountMenu from './AccountMenu.svelte';
	import TankMenu from './TankMenu.svelte';

	let {
		tank,
		tanks,
		cover,
		volume,
		today,
		lastTest,
		user
	}: {
		tank: { id: string; name: string; type: string; startDate: string | null };
		/** every tank, for swiping and the desktop dropdown */
		tanks: ComponentProps<typeof TankMenu>['tanks'];
		cover: string | null | undefined;
		volume: string | null | undefined;
		today: string;
		/** "Last test today, 8:12 AM" (desktop, bottom right) */
		lastTest: string;
		user: { displayName: string; email: string; isAdmin: boolean; avatar: string | null };
	} = $props();

	// "PLANTED · 40 GAL · DAY 214": day 1 is the day it was set up
	const day = $derived(tank.startDate && tank.startDate <= today ? daysBetween(tank.startDate, today) + 1 : null);
	const meta = $derived([tankTypeLabel(tank.type), volume, day ? `Day ${day}` : null].filter(Boolean).join(' · '));

	let touch = { x: 0, y: 0 };
	let swiped = false;
	function swipeStart(e: TouchEvent) {
		touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
		swiped = false;
	}
	function swipeEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - touch.x;
		const dy = e.changedTouches[0].clientY - touch.y;
		if (Math.abs(dx) < 48 || Math.abs(dy) > 32 || tanks.length < 2) return;
		const i = tanks.findIndex((t) => t.id === tank.id);
		const next = tanks[(i + (dx < 0 ? 1 : -1) + tanks.length) % tanks.length];
		swiped = true;
		e.preventDefault(); // no click, so the switcher doesn't open too
		goto(`/?tank=${next.id}`);
	}
</script>

<div class="hero">
	<div class="cover" aria-hidden="true">
		{#if cover}
			<img src={photoUrl(cover, 'full')} alt="" />
		{:else}
			<div class="photo-placeholder ph"></div>
		{/if}
		<div class="fade"></div>
	</div>

	<div class="top">
		<!-- this tank's settings, always in reach: name, volume, photo, targets, sharing -->
		<a class="btn gear" href="/tanks/{tank.id}/settings" aria-label="Tank settings for {tank.name}">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
				><path
					d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
				/><circle cx="12" cy="12" r="3" /></svg
			><span class="hide-phone">Tank settings</span>
		</a>
		<!-- phones: your account over the photo; desktop has it in the sidebar -->
		<span class="acct hide-desk"><AccountMenu {user} id="account-menu-dash" /></span>
		<button type="button" class="btn btn-primary qa hide-phone" onclick={() => (ui.quickAdd = true)}><span aria-hidden="true">+</span> Quick add</button>
	</div>

	<div class="bottom">
		<div class="who">
			<!-- phones: the bottom sheet; desktop: the dropdown, as the header has elsewhere (G12, Ctrl+K) -->
			<div class="tank-pick">
				<button
					type="button"
					class="name"
					aria-label="{tank.name}, switch tank"
					aria-expanded={ui.tankMenu}
					ontouchstart={swipeStart}
					ontouchend={swipeEnd}
					onclick={() => {
						if (!swiped) {
							if (matchMedia('(min-width: 1024px)').matches) ui.tankMenu = !ui.tankMenu;
							else ui.tankSwitcher = true;
						}
						swiped = false;
					}}>{tank.name} <span class="caret" aria-hidden="true">{ui.tankMenu ? '▴' : '▾'}</span></button
				>
				<TankMenu bind:open={ui.tankMenu} {tanks} currentId={tank.id} onpick={(id) => goto(`/?tank=${id}`)} />
			</div>
			<span class="meta data-meta">{meta}</span>
		</div>
		<span class="last data-meta hide-phone">{lastTest}</span>
	</div>
</div>
<div class="waterline" aria-hidden="true"></div>

<style>
	.hero {
		position: relative;
		height: 220px;
		/* full bleed: past the page's side padding */
		margin: -8px -20px 0;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 12px 20px 14px;
		isolation: isolate;
		/* above the page, so the tank dropdown opens over it */
		z-index: 2;
	}
	.tank-pick {
		position: relative;
		align-self: flex-start;
		max-width: 100%;
	}
	.cover {
		position: absolute;
		inset: 0;
		z-index: -1;
		overflow: hidden;
	}
	.cover img,
	.ph {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		border: none;
	}
	/* the name sits on the photo, not in a box */
	.fade {
		position: absolute;
		inset: 0;
		background: linear-gradient(to bottom, transparent, var(--bg) 85%);
	}
	.top {
		display: flex;
		justify-content: flex-end;
		align-items: flex-start;
		gap: 10px;
	}
	/* over the photo: a solid backing so it reads on any picture */
	.gear {
		min-width: 44px;
		height: 44px;
		padding: 0 11px;
		gap: 8px;
		border-radius: 22px;
		background: var(--overlay-bg);
		border: 1px solid var(--border-strong);
		color: var(--text);
	}
	.gear svg {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
	}
	@media (hover: hover) {
		.gear:hover {
			background: var(--surface-hi);
		}
	}
	.acct :global(.avatar) {
		width: 44px;
		height: 44px;
	}
	.acct :global(.face) {
		background: var(--overlay-bg);
	}
	.bottom {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.name {
		align-self: flex-start;
		max-width: 100%;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 0;
		font-size: 28px;
		font-weight: 700;
		line-height: 1.15;
		color: var(--text);
		text-align: left;
		overflow-wrap: anywhere;
	}
	.caret {
		font-size: 16px;
		color: var(--text-muted);
	}
	.meta,
	.last {
		color: var(--text-2);
	}
	.last {
		flex-shrink: 0;
		padding-bottom: 2px;
	}
	.waterline {
		height: 2px;
		background: var(--waterline);
	}
	@media (min-width: 1024px) {
		.hero {
			height: 200px;
			margin: -28px -32px 0;
			padding: 18px 32px 16px;
		}
		.name {
			font-size: 32px;
		}
		.qa {
			height: 44px;
			padding: 0 18px;
		}
		.gear {
			padding: 0 16px 0 13px;
			border-radius: 12px;
			font-size: 15px;
			font-weight: 600;
		}
	}
</style>
