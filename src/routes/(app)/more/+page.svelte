<script lang="ts">
	// Phone "More": the rest of this tank (Photos, Livestock, Plants, Equipment,
	// Spending, Setup, share or get help), then everything app-wide.
	import { page } from '$app/state';
	import { ui } from '$lib/ui.svelte';
	import AccountMenu from '$lib/components/AccountMenu.svelte';
	let { data } = $props();
	const current = $derived(data.tanks.find((t) => t.id === data.currentTankId));
	const unread = $derived(data.alerts.length + (data.app.update ? 1 : 0));
	const base = $derived(current ? `/tanks/${current.id}` : '');
	const q = $derived(current ? `?tank=${current.id}` : '');
</script>

<svelte:head><title>More · Waterline</title></svelte:head>

<div class="page">
	{#if current}
		<section aria-labelledby="this-tank">
			<h2 id="this-tank" class="caps">This tank</h2>
			<ul class="rows">
				<li><a href="/photos{q}"><span>Photos</span><span class="r">{data.counts.photos || ''}</span></a></li>
				<li><a href="{base}/livestock"><span>Livestock</span><span class="r">{data.counts.livestock ? `${data.counts.livestock} animal${data.counts.livestock === 1 ? '' : 's'}` : ''}</span></a></li>
				<li><a href="{base}/plants"><span>Plants</span><span class="r">{data.counts.plants || ''}</span></a></li>
				<li><a href="{base}/equipment"><span>Equipment</span><span class="r">{data.counts.equipment || ''}</span></a></li>
				<li><a href="{base}/spending"><span>Spending</span><span class="r"></span></a></li>
				<li><a href="{base}/settings"><span>Setup & targets</span><span class="r"></span></a></li>
				<li><a href="{base}/summary"><span>Share or get help</span><span class="r">Public page, summary</span></a></li>
			</ul>
		</section>
	{/if}
	<section aria-labelledby="everything">
		<h2 id="everything" class="caps">Everything</h2>
		<ul class="rows">
			<li><a href="/tanks"><span>Tanks</span><span class="r">{data.tanks.length}</span></a></li>
			<li><a href="/tasks"><span>Tasks</span><span class="r" class:bad={!!data.overdueCount}>{data.overdueCount ? `${data.overdueCount} overdue` : ''}</span></a></li>
			<li><button type="button" onclick={() => (ui.alerts = true)}><span>Alerts</span><span class="r">{unread ? `${unread} unread` : ''}</span></button></li>
			<li><a href="/settings"><span>Settings</span><span class="r" class:upd={!!data.app.update}>{data.app.update ? `↑ Update to ${data.app.update.version}` : `v${data.app.version}`}</span></a></li>
		</ul>
	</section>
	<div class="account">
		<AccountMenu user={data.user} id="account-menu-more" />
		<span class="who"><span class="who-name">{data.user.displayName || data.user.email}</span><span class="where">{page.url.host} · Waterline v{data.app.version}</span></span>
	</div>
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.caps {
		margin: 0;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		font-size: 11px;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li + li {
		border-top: 1px solid var(--divider-soft);
	}
	li a,
	li button {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 54px;
		color: var(--text);
		font-size: 15px;
		font-weight: 700;
		text-align: left;
	}
	li a::after,
	li button::after {
		content: '›';
		color: var(--text-muted);
		margin-left: 8px;
	}
	.r {
		margin-left: auto;
		font-size: 13px;
		font-weight: 400;
		color: var(--text-muted);
		text-align: right;
	}
	.r.bad {
		color: var(--bad);
		font-weight: 700;
	}
	.r.upd {
		color: var(--accent-text);
		font-weight: 800;
	}
	.account {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-top: 12px;
		border-top: 1px solid var(--divider);
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
		font-size: 13px;
	}
	.who-name {
		font-weight: 600;
	}
	.where {
		font-size: 12px;
		color: var(--text-faint);
	}
	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
			max-width: 640px;
		}
	}
</style>
