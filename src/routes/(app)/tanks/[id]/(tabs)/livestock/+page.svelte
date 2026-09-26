<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	const base = $derived(`/tanks/${data.tankHead.id}`);
	// pending count per row, confirmed by choosing a reason
	let pending = $state<Record<string, number>>({});
	const KIND: Record<string, string> = { fish: 'Fish', invert: 'Invert', coral: 'Coral' };
	function step(id: string, current: number, by: number) {
		const next = Math.max(0, (pending[id] ?? current) + by);
		if (next === current) delete pending[id];
		else pending[id] = next;
	}
</script>

<svelte:head><title>Livestock · {data.tankHead.name}</title></svelte:head>

<div class="body">
	<div class="main">
		<div class="top">
			<span class="muted">{data.animals} animal{data.animals === 1 ? '' : 's'} · {data.items.length} species</span>
			<a class="btn add" href="{base}/livestock/new">+ Add</a>
		</div>
		{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}

		{#if !data.items.length}
			<div class="card empty">
				<strong>No livestock yet</strong>
				<span class="muted">Add fish, shrimp, snails and corals. The species list works offline; custom names are fine.</span>
				<a class="btn btn-primary" href="{base}/livestock/new">Add livestock</a>
			</div>
		{:else}
			<div class="card table" role="table" aria-label="Livestock">
				<div class="thead" role="row">
					<span role="columnheader">Species</span><span role="columnheader">Type</span><span role="columnheader">Added</span
					><span role="columnheader">Status</span><span role="columnheader" class="r">Count</span>
				</div>
				{#each data.items as l (l.id)}
					{@const next = pending[l.id]}
					<div class="tr" role="row">
						<div class="sp" role="cell">
							<span class="name">{l.name}</span>
							{#if l.scientific}<span class="sci">{l.scientific}</span>{/if}
						</div>
						<span class="d d1" role="cell">{KIND[l.kind]}</span>
						<span class="d d2" role="cell">{l.added}</span>
						<span role="cell" class="st">
							{#if l.status === 'quarantine'}
								<span class="status-warn strong">▲ Quarantine</span>
								<form method="POST" action="?/status" use:enhance>
									<input type="hidden" name="id" value={l.id} />
									<input type="hidden" name="status" value="in_tank" />
									<button class="btn-text sm">Move in</button>
								</form>
							{:else}
								<span class="status-ok d-only">✓ In tank</span>
							{/if}
						</span>
						<div class="stepper" role="cell">
							<button type="button" aria-label="One fewer {l.name}" onclick={() => step(l.id, l.count, -1)}>−</button>
							<span class="num" class:changed={next != null}>{next ?? l.count}</span>
							<button type="button" aria-label="One more {l.name}" onclick={() => step(l.id, l.count, 1)}>+</button>
						</div>
						{#if next != null}
							<form method="POST" action="?/count" class="reason" use:enhance={() => async ({ update }) => { delete pending[l.id]; await update(); }}>
								<input type="hidden" name="id" value={l.id} />
								<input type="hidden" name="count" value={next} />
								<span class="muted">{l.count} → {next}. Log it as:</span>
								{#if next < l.count}
									<button class="chip" name="reason" value="loss">Loss</button>
									<button class="chip" name="reason" value="rehomed">Rehomed</button>
								{:else}
									<button class="chip" name="reason" value="added">Added</button>
								{/if}
								<button class="chip" name="reason" value="recount">Recount</button>
								<button type="button" class="btn-text" onclick={() => delete pending[l.id]}>Cancel</button>
							</form>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if data.past.length}
			<details>
				<summary>Show past livestock ({data.past.length})</summary>
				<ul class="card past">
					{#each data.past as l (l.id)}<li><span>{l.name}</span><span class="muted">{KIND[l.kind]}</span></li>{/each}
				</ul>
			</details>
		{/if}
	</div>

	<aside class="side">
		<section class="card sidecard">
			<div class="sh"><h2>Equipment</h2><a href="{base}/equipment">Manage</a></div>
			{#each data.equipment as e (e.id)}
				<div class="eq"><span class="caps">{e.type}</span><span>{e.line}</span></div>
			{:else}
				<span class="muted sm">None yet</span>
			{/each}
		</section>
		<section class="card sidecard">
			<h2>Recent changes</h2>
			{#each data.recent as r (r.id)}
				<a class="rc" href="/entries/event/{r.id}"><span>{r.title}</span><span class="muted sm">{r.day}</span></a>
			{:else}
				<span class="muted sm">Nothing yet</span>
			{/each}
		</section>
	</aside>
</div>

<style>
	.body {
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.add {
		min-height: 38px;
	}
	.table {
		display: flex;
		flex-direction: column;
	}
	.thead {
		display: none;
	}
	.tr {
		padding: 12px 14px;
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-areas: 'sp step' 'st step' 'reason reason';
		align-items: center;
		gap: 4px 12px;
	}
	.tr + .tr {
		border-top: 1px solid var(--border);
	}
	.sp {
		grid-area: sp;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.name {
		font-size: 16px;
		font-weight: 600;
	}
	.sci {
		font-size: 13px;
		font-style: italic;
		color: var(--text-muted);
	}
	.d {
		display: none;
	}
	.st {
		grid-area: st;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}
	.d-only {
		display: none;
	}
	.strong {
		font-weight: 600;
	}
	.stepper {
		grid-area: step;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.stepper button {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		border: 1px solid var(--border-strong);
		font-size: 20px;
	}
	.stepper .num {
		min-width: 32px;
		text-align: center;
		font-size: 18px;
		font-weight: 600;
	}
	.num.changed {
		color: var(--accent);
	}
	.reason {
		grid-area: reason;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
		padding-top: 8px;
		font-size: 14px;
	}
	.reason .chip {
		color: var(--text);
	}
	.sm {
		font-size: 13px;
	}
	.empty {
		padding: 18px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	details summary {
		cursor: pointer;
		color: var(--text-muted);
		padding: 10px 0;
	}
	.past {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.past li {
		padding: 12px 14px;
		display: flex;
		justify-content: space-between;
	}
	.past li + li {
		border-top: 1px solid var(--border);
	}
	.side {
		display: none;
	}
	@media (min-width: 1024px) {
		.body {
			padding: 24px 32px;
			display: grid;
			grid-template-columns: minmax(0, 1fr) 320px;
			gap: 24px;
			align-items: start;
		}
		.thead {
			display: grid;
			grid-template-columns: minmax(0, 2fr) 80px 100px 150px 150px;
			padding: 10px 14px;
			font-size: 12px;
			letter-spacing: 0.06em;
			text-transform: uppercase;
			color: var(--text-faint);
			border-bottom: 1px solid var(--border);
		}
		.r {
			text-align: right;
		}
		.tr {
			grid-template-columns: minmax(0, 2fr) 80px 100px 150px 150px;
			grid-template-areas: 'sp d1 d2 st step' 'reason reason reason reason reason';
		}
		.d1 {
			grid-area: d1;
		}
		.d2 {
			grid-area: d2;
		}
		.d {
			display: block;
			font-size: 14px;
			color: var(--text-2);
		}
		.d-only {
			display: inline;
		}
		.stepper {
			justify-content: flex-end;
		}
		.side {
			display: flex;
			flex-direction: column;
			gap: 16px;
		}
		.sidecard {
			padding: 16px;
			display: flex;
			flex-direction: column;
			gap: 10px;
		}
		.sidecard h2 {
			margin: 0;
			font-size: 17px;
		}
		.sh {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
		}
		.sh a {
			font-size: 14px;
			font-weight: 600;
		}
		.eq {
			display: flex;
			flex-direction: column;
			gap: 2px;
			font-size: 14px;
		}
		.caps {
			font-size: 11px;
			font-weight: 700;
			letter-spacing: 0.06em;
			text-transform: uppercase;
			color: var(--text-muted);
		}
		.rc {
			display: flex;
			justify-content: space-between;
			gap: 8px;
			font-size: 14px;
			color: var(--text);
		}
	}
</style>
