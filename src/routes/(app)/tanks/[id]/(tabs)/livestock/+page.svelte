<script lang="ts">
	// Livestock (README → Screens §6): a table of species with inline − / + counts,
	// past livestock with Restore, and a 240px column of equipment and recent changes.
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ImportButton from '$lib/components/ImportButton.svelte';
	let { data, form } = $props();
	// species photos still on their way from Wikimedia: look again in a moment, a few times
	let tries = 0;
	$effect(() => {
		if (!data.photosPending || tries >= 4) return;
		const t = setTimeout(() => {
			tries++;
			invalidateAll();
		}, 2500);
		return () => clearTimeout(t);
	});
	const base = $derived(`/tanks/${data.tankHead.id}`);
	// pending count per row, confirmed by choosing a reason
	let pending = $state<Record<string, number>>({});
	const KIND: Record<string, string> = { fish: 'Fish', invert: 'Invert', coral: 'Coral' };
	function step(id: string, current: number, by: number) {
		const next = Math.max(0, (pending[id] ?? current) + by);
		if (next === current) delete pending[id];
		else pending[id] = next;
	}
	const label = (l: { name: string; nickname: string | null }) => (l.nickname ? `${l.nickname} · ${l.name}` : l.name);
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
		<div class="past-rows">
			{#each data.past as l (l.id)}
				<div class="past-row">
					<a class="past-name" href="{base}/livestock/{l.id}">{label(l)}</a>
					<span class="past-note">{KIND[l.kind]} · {l.added}</span>
					<!-- back into the tank: a count of 1, logged as added (the detail page keeps its history) -->
					<form method="POST" action="?/count" use:enhance>
						<input type="hidden" name="id" value={l.id} />
						<input type="hidden" name="count" value="1" />
						<button class="ghost" name="reason" value="added">Restore</button>
					</form>
				</div>
			{/each}
		</div>
	</details>
{/snippet}

<!-- "+ Add livestock" and the "23 animals · 4 species" line are in the tab's toolbar (layout) -->
<div class="body">
	<div class="main">
		{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}

		{#if !data.items.length}
			<EmptyState
				icon="livestock"
				title="No livestock yet"
				text="Just you and the bacteria. Add fish, shrimp, snails and corals. The species list works offline; custom names are fine."
				href="{base}/livestock/new"
				label="Add livestock"
				primary
			>
				<a class="btn" href="{base}/livestock/several">Add several at once</a>
			</EmptyState>
			{#if data.past.length}{@render past()}{/if}
		{:else}
			<div class="table" role="table" aria-label="Livestock">
				<div class="thead" role="row">
					<span role="columnheader">Species</span><span role="columnheader">Type</span><span role="columnheader">Added</span
					><span role="columnheader">Status</span><span role="columnheader" class="r">Count</span>
				</div>
				{#each data.items as l (l.id)}
					{@const next = pending[l.id]}
					<div class="tr" class:pending={next != null} role="row">
						<div class="cells">
							<div class="sp" role="cell">
								{#if l.photo}<img class="lthumb" src={l.photo} alt="" loading="lazy" />{:else}<span class="lthumb photo-placeholder"></span>{/if}
								<div class="sp-text">
									<a class="name" href="{base}/livestock/{l.id}">{l.nickname ?? l.name}{#if l.nickname}<span class="of">{' · ' + l.name}</span>{/if}</a>
									{#if l.scientific}<span class="sci">{l.scientific}</span>{/if}
								</div>
							</div>
							<span class="d" role="cell">{KIND[l.kind]}</span>
							<span class="d" role="cell">{l.added}</span>
							<div class="st" class:in={l.status !== 'quarantine'} role="cell">
								{#if l.status === 'quarantine'}
									<span class="tag tag-neutral q">▲ Quarantine</span>
									<form method="POST" action="?/status" use:enhance>
										<input type="hidden" name="id" value={l.id} />
										<input type="hidden" name="status" value="in_tank" />
										<button class="ghost move">Move in</button>
									</form>
								{:else}
									<span class="in-tank">✓ In tank</span>
								{/if}
							</div>
							<div class="cnt" role="cell">
								<div class="stepper">
									<button type="button" aria-label="One fewer {label(l)}" onclick={() => step(l.id, l.count, -1)}>−</button>
									<span class="value" class:changed={next != null}>{next ?? l.count}</span>
									<!-- a named pet is one animal -->
									<button type="button" aria-label="One more {label(l)}" disabled={!!l.nickname && (next ?? l.count) >= 1} onclick={() => step(l.id, l.count, 1)}>+</button>
								</div>
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
									<p class="ask"><span class="tag tag-accent unsaved">Not saved yet</span><span><b>{l.count} → {next}</b>. Log it as:</span></p>
									<div class="reasons">
										<div class="seg">
											{#if next < l.count}
												<button class="rsn lead" name="reason" value="loss">Loss</button>
												<button class="rsn" name="reason" value="rehomed">Rehomed</button>
											{:else}
												<button class="rsn lead" name="reason" value="added">Added</button>
											{/if}
											<button class="rsn" name="reason" value="recount">Recount</button>
										</div>
										<button type="button" class="ghost cancel" onclick={() => delete pending[l.id]}>Cancel</button>
									</div>
								</form>
							</div>
						{/if}
					</div>
				{/each}
			</div>
			{#if data.past.length}{@render past()}{/if}
		{/if}
		<!-- below the list, or below the empty box: in the same place on every tab -->
		<ImportButton href="{base}/import/livestock" />
	</div>

	<aside class="side">
		<section>
			<div class="sh"><span class="kicker">Equipment</span><a class="ghost" href="{base}/equipment">Manage</a></div>
			{#if data.equipment.length}
				<div class="eqs">
					{#each data.equipment as e (e.id)}
						<a class="eq" href="{base}/equipment/{e.id}"><span class="eq-text"><span class="kicker">{e.type}</span><span class="line">{e.line}</span></span><span class="chev" aria-hidden="true">›</span></a>
					{/each}
				</div>
			{:else}
				<p class="none">None added yet</p>
			{/if}
		</section>
		<section>
			<div class="sh"><span class="kicker">Recent changes</span></div>
			{#if data.recent.length}
				<ul class="recent">
					{#each data.recent as r (r.id)}
						{@const [what, detail] = split(r.title)}
						<li>
							<a href="/entries/event/{r.id}">
								<span class="rc-t"><b>{what}</b>{#if detail}<span class="muted">{' · ' + detail}</span>{/if}</span>
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
		padding: 16px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	/* a text button in the accent (the design's ghost), 44px to tap without making rows taller */
	.ghost {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin: -10px 0;
		padding: 0 4px;
		font-size: 14px;
		font-weight: 800;
		color: var(--accent);
		white-space: nowrap;
	}

	/* The table: an uppercase header row over a 2px ink rule, rows with 1px dividers. */
	.table {
		display: flex;
		flex-direction: column;
	}
	.thead {
		display: none;
	}
	.tr {
		display: flex;
		flex-direction: column;
		border-bottom: 1px solid var(--divider);
	}
	.tr.pending {
		background: var(--surface);
		box-shadow: -8px 0 0 var(--surface), 8px 0 0 var(--surface);
	}
	.cells {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas: 'sp cnt' 'st st';
		align-items: center;
		column-gap: 12px;
		padding: 10px 0;
	}
	.d {
		display: none;
	}
	.sp {
		grid-area: sp;
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.sp-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	/* its photo: a pet's own, else the species photo */
	.lthumb {
		width: 40px;
		height: 40px;
		flex-shrink: 0;
		border: none;
		object-fit: cover;
		background: var(--surface);
	}
	.name {
		font-size: 15px;
		font-weight: 600;
		color: var(--text);
		overflow-wrap: anywhere;
	}
	.name:hover {
		color: var(--accent);
	}
	.of {
		font-weight: 400;
		color: var(--text-muted);
	}
	.sci {
		font-size: 12px;
		font-style: italic;
		color: var(--text-muted);
	}
	.st {
		grid-area: st;
		display: flex;
		align-items: center;
		gap: 10px;
		padding-top: 8px;
		white-space: nowrap;
	}
	.st.in {
		display: none;
	}
	.in-tank {
		font-size: 13px;
		font-weight: 800;
		color: var(--text-muted);
	}
	.q {
		font-weight: 800;
	}
	.st form {
		display: flex;
	}
	.cnt {
		grid-area: cnt;
	}
	/* − 12 + : a bordered control with rules between its parts */
	.stepper {
		display: flex;
		align-items: stretch;
		height: 44px;
		border: 1px solid var(--divider);
	}
	.stepper button {
		width: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 18px;
		color: var(--text);
	}
	.stepper button:disabled {
		color: var(--placeholder);
		cursor: default;
	}
	.stepper .value {
		width: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 16px;
		font-weight: 800;
		border-left: 1px solid var(--divider);
		border-right: 1px solid var(--divider);
	}
	.value.changed {
		color: var(--bad);
	}
	/* "Not saved yet · 14 → 13. Log it as:" over the reasons, then Save by choosing one */
	.reason {
		padding: 0 0 14px;
	}
	.reason form {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.ask {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 6px 10px;
		font-size: 14px;
	}
	.unsaved {
		font-weight: 800;
	}
	.reasons {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px;
	}
	.seg {
		display: flex;
		border: 1px solid var(--divider);
	}
	.rsn {
		position: relative;
		min-width: 84px;
		height: 42px;
		padding: 0 14px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
	}
	.rsn + .rsn {
		border-left: 1px solid var(--divider);
	}
	.rsn.lead {
		background: var(--accent);
		color: var(--on-accent);
		font-weight: 800;
	}
	.cancel {
		color: var(--text-muted);
		margin: 0;
	}

	/* Past livestock: a ghost button, then rows with Restore */
	.past {
		display: flex;
		flex-direction: column;
	}
	.past summary {
		list-style: none;
		align-self: flex-end;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 4px;
		font-size: 14px;
		font-weight: 800;
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
	.past-rows {
		display: flex;
		flex-direction: column;
	}
	.past-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
		color: var(--text-2);
	}
	.past-name {
		flex: 1;
		min-width: 0;
		color: var(--text);
		font-weight: 600;
	}
	.past-note {
		color: var(--text-muted);
		white-space: nowrap;
	}
	.past-row form {
		display: flex;
	}

	/* The right column: equipment and recent changes under kicker + 2px rule */
	.side {
		display: grid;
		gap: 24px;
		border-top: 2px solid var(--divider);
		padding-top: 24px;
	}
	.side section {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.sh {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
	}
	.sh .kicker {
		color: var(--text);
	}
	.sh .ghost {
		font-size: 13px;
		margin: -12px 0;
	}
	.eqs {
		display: flex;
		flex-direction: column;
	}
	.eq {
		padding: 10px 6px 10px 0;
		display: flex;
		align-items: center;
		gap: 8px;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	.eq-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.line {
		font-size: 14px;
		font-weight: 600;
	}
	.chev {
		font-size: 16px;
		color: var(--neutral-600);
	}
	.recent {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.recent a {
		padding: 9px 0;
		display: flex;
		justify-content: space-between;
		gap: 12px;
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
		color: var(--text);
	}
	.rc-t b {
		font-weight: 600;
	}
	.rc-d {
		flex-shrink: 0;
		white-space: nowrap;
		color: var(--text-muted);
	}
	.none {
		margin: 0;
		padding: 10px 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	@media (hover: hover) {
		.rsn:not(.lead):hover,
		.stepper button:not(:disabled):hover {
			background: color-mix(in srgb, var(--text) 7%, transparent);
		}
		.rsn.lead:hover {
			background: var(--accent-600);
		}
		.ghost:hover,
		.past summary:hover {
			background: color-mix(in srgb, var(--accent) 10%, transparent);
			color: var(--accent);
		}
		.cancel:hover {
			color: var(--text);
		}
		.eq:hover .line,
		.recent a:hover .rc-t b {
			color: var(--accent);
		}
	}

	/* Desktop: the table `minmax(0,1fr) 60px 72px 160px 120px`, then a 240px column past a 2px rule */
	@media (min-width: 1024px) {
		.body {
			padding: 0 32px;
			display: grid;
			grid-template-columns: minmax(0, 1fr) 240px;
			gap: 0;
			align-items: start;
		}
		.main {
			padding: 24px 24px 32px 0;
			border-right: 2px solid var(--divider);
		}
		.thead,
		.cells {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 60px 72px 160px 120px;
			grid-template-areas: none;
			column-gap: 16px;
			align-items: center;
		}
		.thead {
			padding: 8px 0;
			border-bottom: 2px solid var(--ink);
			font-size: 11px;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--text-muted);
		}
		.r {
			text-align: right;
		}
		.tr.pending {
			box-shadow: none;
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
		.d {
			display: block;
			font-size: 14px;
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
		.stepper {
			height: 36px;
		}
		.stepper button {
			width: 34px;
		}
		.stepper .value {
			width: 38px;
		}
		.reason {
			padding: 2px 0 14px 52px;
		}
		.rsn {
			height: 36px;
		}
		.side {
			display: flex;
			flex-direction: column;
			gap: 24px;
			padding: 24px 0 32px 24px;
			border-top: none;
		}
		.sh .ghost {
			margin: -12px 0;
		}
	}
	/* a narrower main area: tighter columns */
	@media (min-width: 1024px) and (max-width: 1199px) {
		.thead,
		.cells {
			grid-template-columns: minmax(0, 1fr) 52px 64px 110px 112px;
			column-gap: 10px;
		}
		.thead .r {
			white-space: nowrap;
		}
	}
	@media (max-width: 1023px) and (min-width: 600px) {
		.side {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
