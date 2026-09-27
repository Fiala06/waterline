<script lang="ts">
	import { enhance } from '$app/forms';
	import EmptyState from '$lib/components/EmptyState.svelte';
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
	// "−1 Harlequin rasbora · loss": the part after the first " · " is muted (T6)
	function split(title: string) {
		const i = title.indexOf(' · ');
		return i < 0 ? [title, ''] : [title.slice(0, i), title.slice(i + 3)];
	}
</script>

<svelte:head><title>Livestock · {data.tankHead.name}</title></svelte:head>

{#snippet past()}
	<details class="past">
		<summary><span class="show">Show past livestock ({data.past.length})</span><span class="hide">Hide past livestock</span></summary>
		<ul>
			{#each data.past as l (l.id)}<li><span>{l.name}</span><span class="muted">{KIND[l.kind]}</span></li>{/each}
		</ul>
	</details>
{/snippet}

<!-- "+ Add" is in the tank header (layout) -->
<div class="body">
	<div class="main">
		{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}

		{#if !data.items.length}
			<EmptyState
				icon="livestock"
				title="No livestock yet"
				text="Add fish, shrimp, snails and corals. The species list works offline; custom names are fine."
				href="{base}/livestock/new"
				label="Add livestock"
				primary
			>
				<a class="import-link" href="{base}/import/livestock">Import a list from a spreadsheet</a>
			</EmptyState>
			{#if data.past.length}{@render past()}{/if}
		{:else}
			<p class="total">{data.animals} animal{data.animals === 1 ? '' : 's'} · {data.items.length} species</p>
			<div class="table" role="table" aria-label="Livestock">
				<div class="thead" role="row">
					<span role="columnheader">Species</span><span role="columnheader">Type</span><span role="columnheader">Added</span
					><span role="columnheader">Status</span><span role="columnheader" class="r">Count</span>
				</div>
				{#each data.items as l (l.id)}
					{@const next = pending[l.id]}
					<div class="tr" class:pending={next != null} role="row">
						<div class="sp" role="cell">
							<span class="name">{l.name}</span>
							{#if l.scientific}<span class="sci">{l.scientific}</span>{/if}
						</div>
						<span class="d" role="cell">{KIND[l.kind]}</span>
						<span class="d" role="cell">{l.added}</span>
						<div class="st" class:in={l.status !== 'quarantine'} role="cell">
							{#if l.status === 'quarantine'}
								<span class="status-tag tag-warn sm">▲ Quarantine</span>
								<form method="POST" action="?/status" use:enhance>
									<input type="hidden" name="id" value={l.id} />
									<input type="hidden" name="status" value="in_tank" />
									<button class="move">Move in</button>
								</form>
							{:else}
								<span class="in-tank">✓ In tank</span>
							{/if}
						</div>
						<div class="cnt" role="cell">
							<div class="count-stepper">
								<button type="button" aria-label="One fewer {l.name}" onclick={() => step(l.id, l.count, -1)}>−</button>
								<span class="value" class:changed={next != null}>{next ?? l.count}</span>
								<button type="button" aria-label="One more {l.name}" onclick={() => step(l.id, l.count, 1)}>+</button>
							</div>
						</div>
						{#if next != null}
							<div class="reason" role="cell">
								<form
									method="POST"
									action="?/count"
									use:enhance={() =>
										async ({ update }) => {
											delete pending[l.id];
											await update();
										}}
								>
									<input type="hidden" name="id" value={l.id} />
									<input type="hidden" name="count" value={next} />
									<p class="ask">{l.count} → {next}. Log it as:</p>
									<div class="reasons">
										{#if next < l.count}
											<button class="rsn lead" name="reason" value="loss">Loss</button>
											<button class="rsn" name="reason" value="rehomed">Rehomed</button>
										{:else}
											<button class="rsn lead" name="reason" value="added">Added</button>
										{/if}
										<button class="rsn" name="reason" value="recount">Recount</button>
										<button type="button" class="cancel" onclick={() => delete pending[l.id]}>Cancel</button>
									</div>
								</form>
							</div>
						{/if}
					</div>
				{/each}
				{#if data.past.length}
					<div class="tfoot" role="row"><div role="cell">{@render past()}</div></div>
				{/if}
			</div>
			<a class="import-link" href="{base}/import/livestock">Import from a spreadsheet</a>
		{/if}
	</div>

	<aside class="side">
		<section>
			<div class="sh"><h2>Equipment</h2><a href="{base}/equipment">Manage</a></div>
			{#if data.equipment.length}
				<div class="card eqs">
					{#each data.equipment as e (e.id)}
						<a class="eq" href="{base}/equipment/{e.id}"><span class="caps">{e.type}</span><span class="line">{e.line}</span></a>
					{/each}
				</div>
			{:else}
				<p class="none">None added yet</p>
			{/if}
		</section>
		<section>
			<div class="sh"><h2>Recent changes</h2></div>
			{#if data.recent.length}
				<ul class="recent">
					{#each data.recent as r (r.id)}
						{@const [what, detail] = split(r.title)}
						<li>
							<a href="/entries/event/{r.id}">
								<span class="rc-t">{what}{#if detail}<span class="muted">{' · ' + detail}</span>{/if}</span>
								<span class="rc-d">{r.day}</span>
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="none">None added yet</p>
			{/if}
		</section>
	</aside>
</div>

<style>
	.body {
		padding: 12px 20px 16px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.total {
		margin: 0 0 -2px;
		font-size: 13px;
		color: var(--text-muted);
	}

	/* Phones (T4): one card per species */
	.table {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.thead,
	.d {
		display: none;
	}
	.tr {
		padding: 12px 12px 12px 14px;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas: 'sp cnt' 'st st' 'rs rs';
		align-items: center;
		column-gap: 12px;
	}
	.tr.pending {
		border-color: var(--accent);
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
	.st {
		grid-area: st;
		display: flex;
		align-items: center;
		gap: 10px;
		padding-top: 6px;
		white-space: nowrap;
	}
	.st.in {
		display: none;
	}
	.in-tank {
		font-size: 13px;
		font-weight: 600;
		color: var(--ok);
	}
	.st form {
		display: flex;
	}
	/* a text link, 44px to tap without making the row taller */
	.move {
		position: relative;
		min-height: 36px;
		margin: -8px 0;
		display: inline-flex;
		align-items: center;
		font-size: 14px;
		font-weight: 600;
		color: var(--accent);
		white-space: nowrap;
	}
	.move::after {
		content: '';
		position: absolute;
		inset: -4px -6px;
	}
	.cnt {
		grid-area: cnt;
	}
	.value.changed {
		color: var(--accent);
	}
	/* T4: "14 → 13. Log it as:" over one row of reasons */
	.reason {
		grid-area: rs;
		margin-top: 12px;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}
	.reason form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.ask {
		margin: 0;
		font-size: 13px;
		color: var(--text-2);
	}
	.reasons {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.rsn {
		position: relative;
		height: 36px;
		padding: 0 12px;
		border-radius: 10px;
		border: 1px solid var(--border-strong);
		font-size: 13px;
		color: var(--text);
		white-space: nowrap;
	}
	.rsn::after {
		content: '';
		position: absolute;
		inset: -4px 0;
	}
	.rsn.lead {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
		font-weight: 700;
	}
	.cancel {
		margin-left: auto;
		min-height: 44px;
		padding: 0 4px;
		font-size: 14px;
		color: var(--text-muted);
	}

	.past summary {
		list-style: none;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-size: 14px;
		font-weight: 600;
		color: var(--accent);
		cursor: pointer;
	}
	.past summary::-webkit-details-marker {
		display: none;
	}
	.past[open] .show,
	.past:not([open]) .hide {
		display: none;
	}
	.past ul {
		list-style: none;
		margin: 0;
		padding: 0;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.past li {
		padding: 12px 14px;
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 15px;
	}
	.past li + li {
		border-top: 1px solid var(--border);
	}
	.past .muted {
		font-size: 13px;
	}
	.side {
		display: none;
	}
	@media (hover: hover) {
		.rsn:not(.lead):hover {
			background: var(--surface-hi);
		}
		.rsn.lead:hover {
			background: color-mix(in srgb, var(--accent) 86%, var(--text));
		}
		.cancel:hover {
			color: var(--text);
		}
		.past summary:hover,
		.move:hover {
			color: var(--accent-hover);
		}
	}

	/* Desktop (T6): one table, columns sized to their content */
	@media (min-width: 1024px) {
		.body {
			padding: 22px 32px;
			display: grid;
			grid-template-columns: minmax(0, 1fr) 280px;
			gap: 24px;
			align-items: start;
		}
		.main {
			gap: 10px;
		}
		.total {
			margin: 0;
		}
		.table {
			display: grid;
			grid-template-columns: minmax(0, 1fr) repeat(4, max-content);
			column-gap: 20px;
			border-radius: 16px;
			background: var(--surface);
			border: 1px solid var(--border);
			overflow: hidden;
		}
		.thead,
		.tr {
			grid-column: 1 / -1;
			display: grid;
			grid-template-columns: minmax(0, 1fr) 64px 110px 170px 140px;
			grid-template-columns: subgrid;
			align-items: center;
		}
		.thead {
			padding: 12px 16px;
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
			grid-template-areas: none;
			padding: 10px 16px;
			border: none;
			border-radius: 0;
			background: none;
		}
		.tr + .tr {
			border-top: 1px solid var(--divider-soft);
		}
		.tr.pending {
			box-shadow: inset 0 0 0 1px var(--accent);
		}
		.sp,
		.st,
		.cnt {
			grid-area: auto;
		}
		.name,
		.sci {
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.name {
			font-size: 15px;
		}
		.sci {
			font-size: 12px;
		}
		.d {
			display: block;
			font-size: 14px;
			color: var(--text-2);
			white-space: nowrap;
		}
		.st,
		.st.in {
			display: flex;
			padding: 0;
		}
		.cnt {
			justify-self: end;
		}
		.count-stepper {
			height: 38px;
			border-radius: 10px;
		}
		.count-stepper button {
			width: 36px;
			font-size: 18px;
		}
		.count-stepper .value {
			width: 36px;
			font-size: 16px;
			font-weight: 700;
		}
		.reason {
			grid-column: 1 / -1;
			margin-top: 10px;
		}
		.reason form {
			flex-direction: row;
			align-items: center;
			gap: 12px;
		}
		.reasons {
			flex: 1;
		}
		.tfoot {
			grid-column: 1 / -1;
			padding: 0 16px;
			border-top: 1px solid var(--border);
			display: flex;
			flex-direction: column;
		}
		.tfoot .past summary {
			display: flex;
			width: fit-content;
			margin-left: auto;
			font-size: 13px;
		}
		.tfoot .past ul {
			margin: 0 -16px;
			border: none;
			border-top: 1px solid var(--divider-soft);
			border-radius: 0;
			background: none;
		}
		.tfoot .past li {
			padding: 10px 16px;
			font-size: 14px;
		}
		.tfoot .past li + li {
			border-top-color: var(--divider-soft);
		}
		.side {
			display: flex;
			flex-direction: column;
			gap: 18px;
		}
		.side section {
			display: flex;
			flex-direction: column;
			gap: 10px;
		}
		.sh {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			gap: 12px;
		}
		.sh h2 {
			margin: 0;
			font-size: 16px;
			font-weight: 600;
		}
		.sh a {
			font-size: 14px;
			font-weight: 600;
			padding: 12px 0 12px 12px;
			margin: -12px 0 -12px -12px;
		}
		.eqs {
			display: flex;
			flex-direction: column;
			overflow: hidden;
			border-radius: 14px;
		}
		.eq {
			padding: 11px 14px;
			display: flex;
			flex-direction: column;
			gap: 2px;
			color: var(--text);
		}
		.eq + .eq {
			border-top: 1px solid var(--border);
		}
		.eq:hover {
			color: var(--text);
			background: var(--surface-hi);
		}
		.caps {
			font-size: 12px;
			letter-spacing: 0.06em;
			text-transform: uppercase;
			color: var(--text-muted);
		}
		.line {
			font-size: 14px;
			font-weight: 600;
		}
		.recent {
			list-style: none;
			margin: 0;
			padding: 0;
		}
		.recent li + li {
			border-top: 1px solid var(--divider-soft);
		}
		.recent a {
			padding: 8px 0;
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			gap: 12px;
			font-size: 14px;
			color: var(--text);
		}
		.recent a:hover .rc-t {
			color: var(--accent-hover);
		}
		.rc-d {
			flex-shrink: 0;
			white-space: nowrap;
			color: var(--text-muted);
		}
		.none {
			margin: 0;
			font-size: 14px;
			color: var(--text-muted);
		}
	}
</style>
