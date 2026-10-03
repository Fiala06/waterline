<script lang="ts">
	// The tank's tabs (Livestock, Plants, Equipment, Spending, Setup) sit in the
	// app shell's tank header; this layout holds each tab's own toolbar.
	import { page } from '$app/state';
	import { setContext } from 'svelte';
	let { data, children } = $props();
	const h = $derived(data.tankHead);
	const base = $derived(`/tanks/${h.id}`);
	const path = $derived(page.url.pathname);
	// Plants' buttons open that page's sheets.
	const plantSheets = $state({ add: false, trim: false });
	setContext('plant-sheets', plantSheets);
	const plantCount = $derived(((page.data as { plants?: unknown[] }).plants ?? []).length);
	const sub = $derived(
		path === `${base}/equipment`
			? 'equipment'
			: path === `${base}/livestock`
				? 'livestock'
				: path === `${base}/spending`
					? 'spending'
					: path === `${base}/plants`
						? 'plants'
						: null
	);
</script>

<div class="tank-page">
	{#if h.archived}
		<p class="archived"><span class="tag tag-neutral">Archived</span> This tank is archived. Restore it from <a href="/tanks">Tanks</a>.</p>
	{/if}
	{#if sub}
		<div class="toolbar">
			<span class="count">{page.data.toolbarText ?? ''}</span>
			<div class="acts">
				{#if sub === 'equipment'}
					<a class="btn btn-primary" href="{base}/equipment/new">+ Add equipment</a>
				{:else if sub === 'livestock'}
					<a class="btn" href="{base}/livestock/several">Add several</a>
					<a class="btn btn-primary" href="{base}/livestock/new">+ Add livestock</a>
				{:else if sub === 'spending'}
					<a class="btn btn-primary" href="{base}/spending/new">+ Add expense</a>
				{:else if sub === 'plants'}
					{#if plantCount}<button type="button" class="btn" onclick={() => (plantSheets.trim = true)}>Log trim</button>{/if}
					<a class="btn" href="{base}/plants/several">Add several</a>
					<button type="button" class="btn btn-primary" onclick={() => (plantSheets.add = true)}>+ Add plant</button>
				{/if}
			</div>
		</div>
	{/if}
	{@render children()}
</div>

<style>
	.tank-page {
		display: flex;
		flex-direction: column;
		padding-bottom: calc(24px + env(safe-area-inset-bottom));
	}
	.archived {
		margin: 12px 20px 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 20px 0;
	}
	.count {
		flex: 1 1 100%;
		font-size: 13px;
		color: var(--text-muted);
	}
	.count:empty {
		display: none;
	}
	.acts {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	@media (min-width: 1024px) {
		.archived {
			margin: 16px 32px 0;
		}
		.toolbar {
			padding: 20px 32px 0;
			flex-wrap: nowrap;
		}
		.count {
			flex: 1 1 auto;
		}
	}
</style>
