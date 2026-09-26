<script lang="ts">
	import { page } from '$app/state';
	import { setContext } from 'svelte';
	import { hscroll } from '$lib/actions';
	import { photoUrl } from '$lib/media';
	let { data, children } = $props();
	const h = $derived(data.tankHead);
	const base = $derived(`/tanks/${h.id}`);
	const path = $derived(page.url.pathname);
	const tabs = $derived([
		{ href: base, label: 'Overview' },
		{ href: `${base}/equipment`, label: 'Equipment' },
		{ href: `${base}/livestock`, label: 'Livestock' },
		{ href: `${base}/plants`, label: 'Plants' },
		{ href: `${base}/settings`, label: 'Settings' }
	]);
	const overview = $derived(path === base);
	// Each tab's page action sits in this header (T2, T4, T7): next to "‹ Tanks" on phones,
	// at the end of the tab row on desktop. Plants' buttons open that page's sheets.
	const plantSheets = $state({ add: false, trim: false });
	setContext('plant-sheets', plantSheets);
	const plantCount = $derived(((page.data as { plants?: unknown[] }).plants ?? []).length);
</script>

<div class="tank-page">
	{#if overview}
		<div class="cover hide-desk" class:photo-placeholder={!h.cover}>
			{#if h.cover}<img src={photoUrl(h.cover, 'full')} alt="" />{:else}<span class="mono">cover photo</span>{/if}
			<a class="back over" href="/tanks">‹ Tanks</a>
		</div>
	{/if}
	<!-- on desktop the header has "Tanks › {name}" -->
	<div class="head" class:overview>
		{#if !overview}<a class="back hide-desk" href="/tanks">‹ Tanks</a>{/if}
		<h1 class="hide-desk">{h.name}{#if h.archived}<span class="archived">Archived</span>{/if}</h1>
		<p class="sub" class:hide-phone={!overview}>
			{#if h.archived}<span class="archived hide-phone">Archived</span>{/if}{h.sub}
		</p>
		<div class="tabrow">
			<nav class="tabs hscroll" aria-label="Tank sections" use:hscroll={path}>
				{#each tabs as t (t.href)}
					<a href={t.href} class:active={path === t.href} aria-current={path === t.href ? 'page' : undefined}>{t.label}</a>
				{/each}
			</nav>
			{#if path === `${base}/equipment`}
				<div class="acts">
					<a class="btn" href="{base}/equipment/new"><span class="hide-desk">+ Add</span><span class="hide-phone">+ Add equipment</span></a>
				</div>
			{:else if path === `${base}/livestock`}
				<div class="acts">
					<a class="btn" href="{base}/livestock/new"><span class="hide-desk">+ Add</span><span class="hide-phone">+ Add livestock</span></a>
				</div>
			{:else if path === `${base}/plants`}
				<div class="acts">
					{#if plantCount}<button type="button" class="btn" onclick={() => (plantSheets.trim = true)}>Log trim</button>{/if}
					<button type="button" class="btn" onclick={() => (plantSheets.add = true)}
						><span class="hide-desk">+ Add</span><span class="hide-phone">+ Add plant</span></button
					>
				</div>
			{/if}
		</div>
	</div>
	{@render children()}
</div>

<style>
	.tank-page {
		display: flex;
		flex-direction: column;
		padding-bottom: calc(24px + env(safe-area-inset-bottom));
	}
	/* T1: full-bleed cover with "‹ Tanks" floating on it */
	.cover {
		position: relative;
		height: 170px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		color: var(--text-faint);
		overflow: hidden;
		border: none;
	}
	.cover img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.over {
		position: absolute;
		left: 16px;
		top: 14px;
		min-height: 36px;
		padding: 0 12px;
		border-radius: 18px;
		background: var(--overlay-bg);
		font-size: 14px;
	}
	/* 36px to match T1, 44px to tap */
	.over::after {
		content: '';
		position: absolute;
		inset: -4px -2px;
	}
	.head {
		position: relative;
		padding: 4px 20px 0;
		border-bottom: 1px solid var(--border);
	}
	.head.overview {
		padding-top: 16px;
	}
	h1 {
		margin: 2px 0 0;
		font-size: 24px;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.overview h1 {
		margin: 0;
		font-size: 26px;
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
		margin: 4px 0 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.sub .archived {
		margin-right: 8px;
	}
	.tabrow {
		margin-top: 12px;
	}
	.tabs {
		gap: 6px;
		margin: 0 -20px;
		padding: 0 12px;
	}
	.tabs a {
		min-height: 44px;
		padding: 0 8px 12px;
		display: flex;
		align-items: flex-end;
		font-size: 15px;
		color: var(--text-muted);
		white-space: nowrap;
		border-bottom: 2px solid transparent;
	}
	.tabs a:hover {
		color: var(--text);
	}
	.tabs a.active {
		color: var(--accent);
		font-weight: 600;
		border-bottom-color: var(--accent);
	}
	/* phones: in the "‹ Tanks" row above the name */
	.acts {
		position: absolute;
		top: 7px;
		right: 20px;
		display: flex;
		gap: 8px;
	}
	.acts .btn {
		position: relative;
		min-height: 38px;
		padding: 0 14px;
		border-radius: 10px;
		font-size: 14px;
	}
	.acts .btn::after {
		content: '';
		position: absolute;
		inset: -3px 0;
	}
	@media (min-width: 1024px) {
		.head,
		.head.overview {
			padding: 18px 32px 0;
		}
		.sub {
			margin: 0;
		}
		/* same height with or without actions, so the tabs don't move between tabs */
		.tabrow {
			min-height: 48px;
			margin-top: 4px;
			display: flex;
			align-items: flex-end;
			justify-content: space-between;
			gap: 16px;
		}
		.tabs {
			gap: 22px;
			margin: 0;
			padding: 0;
		}
		.tabs a {
			padding: 0 2px 12px;
		}
		.acts {
			position: static;
			flex-shrink: 0;
			padding-bottom: 8px;
		}
		.acts .btn {
			min-height: 40px;
			font-size: 15px;
		}
	}
</style>
