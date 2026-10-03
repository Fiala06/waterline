<script lang="ts">
	// Tank details: Specs, Notes and Routines beside Equipment, Livestock and
	// Plants, each a section head over a 2px ink rule with rows divided by 1px
	// lines (the redesign's section pattern). The shell shows the cover and name.
	import EmptyState from '$lib/components/EmptyState.svelte';
	import RemindMe from '$lib/components/RemindMe.svelte';
	import { enhance } from '$app/forms';
	let { data } = $props();
	const base = $derived(`/tanks/${data.tankHead.id}`);
	const newRoutine = (type: 'dosing' | 'feeding') => `/tasks/new?tank=${data.tankHead.id}&type=${type}&from=${encodeURIComponent(base)}`;
</script>

<svelte:head><title>{data.tankHead.name} · Waterline</title></svelte:head>

<div class="body">
	<div class="col">
		<section>
			<div class="section-head"><h2>Specs</h2>{#if data.specs.length}<a href="{base}/settings">Edit ›</a>{/if}</div>
			{#if data.specs.length}
				<dl class="specs">
					{#each data.specs as [k, v] (k)}<div class="spec"><dt>{k}</dt><dd>{v}</dd></div>{/each}
				</dl>
			{:else}
				<EmptyState
					compact
					icon="tank"
					title="None added yet"
					text="Add the tank model, size, glass, substrate and light hours in Settings."
					href="{base}/settings"
					label="Add specs"
				/>
			{/if}
		</section>
		<section aria-labelledby="notes-h">
			<div class="section-head">
				<h2 id="notes-h">Notes</h2>
				{#if data.recentNotes.length}<a href="/history?tank={data.tankHead.id}&cat=note&range=all">All ›</a>{/if}
			</div>
			{#if data.notes}
				<div class="pinned">
					<div class="pin-h"><span class="kicker">Pinned</span><a href="{base}/settings#notes">Edit</a></div>
					<p class="notes">{data.notes}</p>
				</div>
			{/if}
			{#if data.recentNotes.length}
				<ul class="list note-list">
					{#each data.recentNotes as n (n.id)}
						<li><a href="/entries/event/{n.id}"><span class="nd">{n.day}</span><span class="nt">{n.text}</span></a></li>
					{/each}
				</ul>
			{:else if !data.notes}
				<p class="none">Dated notes about this tank, newest first. They're in History too.</p>
			{/if}
			<div class="acts">
				<a class="btn" href="/entries/event/new?tank={data.tankHead.id}&category=note&from={encodeURIComponent(base)}">Add note</a>
				<RemindMe tankId={data.tankHead.id} tankName={data.tankHead.name} today={data.today} />
			</div>
		</section>
		<section aria-labelledby="routines-h">
			<div class="section-head">
				<h2 id="routines-h">Routines{data.routines.length ? ` · ${data.routines.length}` : ''}</h2>
				{#if data.routines.length}<a href="/tasks?filter={data.tankHead.id}">All ›</a>{/if}
			</div>
			{#if data.routines.length}
				<ul class="list routines">
					{#each data.routines as r (r.id)}
						<li>
							<a class="r-text" href="/tasks/{r.id}">
								<span class="r-name">{r.name}</span>
								<span class="r-line">{r.line} · <span class={r.level === 'ok' ? '' : `status-${r.level}`}>{r.due}</span></span>
							</a>
							<form method="POST" action="/tasks?/done" use:enhance>
								<input type="hidden" name="taskId" value={r.id} />
								<input type="hidden" name="from" value={base} />
								<button class="btn" class:btn-primary={r.now} aria-label="Mark {r.name} done">Done</button>
							</form>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="none">Dosing and feeding on a schedule. Marking one done logs it in History.</p>
			{/if}
			<div class="acts">
				<a class="btn" href={newRoutine('dosing')}>Add dosing</a>
				<a class="btn" href={newRoutine('feeding')}>Add feeding</a>
			</div>
		</section>
	</div>
	<div class="col side">
		<section>
			<div class="section-head">
				<h2>Equipment{data.equipment.length ? ` · ${data.equipment.length}` : ''}</h2>
				{#if data.equipment.length}<a href="{base}/equipment">All ›</a>{/if}
			</div>
			{#if data.equipment.length}
				<div class="list">
					{#each data.equipment as e (e.id)}
						<a class="eq" href="{base}/equipment/{e.id}"><span class="k">{e.type}</span><span class="v">{e.name}</span></a>
					{/each}
				</div>
			{:else}
				<EmptyState compact icon="equipment" title="None added yet" href="{base}/equipment/new" label="Add equipment" />
			{/if}
		</section>

		<section>
			<div class="section-head">
				<h2>Livestock{data.livestock.length ? ` · ${data.animals} in ${data.species} species` : ''}</h2>
				{#if data.livestock.length}<a href="{base}/livestock">All ›</a>{/if}
			</div>
			{#if data.livestock.length}
				<ul class="list stock">
					{#each data.livestock as l (l.id)}
						<li>
							<span class="s-name">{l.name}</span>
							{#if l.quarantine}<span class="status-tag tag-warn sm">▲ Quarantine</span>{/if}
							<span class="count">{l.count}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<EmptyState compact icon="livestock" title="None added yet" href="{base}/livestock/new" label="Add livestock" />
			{/if}
		</section>

		<section>
			<div class="section-head">
				<h2>Plants{data.plants.length ? ` · ${data.plants.length}` : ''}</h2>
				{#if data.plants.length}<a href="{base}/plants">All ›</a>{/if}
			</div>
			{#if data.plants.length}
				<p class="plants">{data.plants.join(', ')}</p>
			{:else}
				<EmptyState compact icon="plant" title="None added yet" href="{base}/plants" label="Add plants" />
			{/if}
		</section>

		<section>
			<div class="section-head"><h2>Get help</h2></div>
			<a class="ai" href="{base}/summary">
				<span class="ai-text">
					<span class="ai-t">Copy a summary of this tank</span>
					<span class="ai-s">Its readings, care log and stocking as text, for a forum post, a friend, your fish store or an AI chat.</span>
				</span>
				<span class="chev" aria-hidden="true">›</span>
			</a>
		</section>
	</div>
</div>

<style>
	.body {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
	}
	.col {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	section {
		display: flex;
		flex-direction: column;
		padding: 18px 0 10px;
	}
	/* the "Get help" row */
	.ai {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 0;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	.ai-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.ai-t {
		font-size: 15px;
		font-weight: 700;
	}
	.ai-s {
		font-size: 13px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.chev {
		font-size: 20px;
		color: var(--text-muted);
	}
	@media (hover: hover) {
		.ai:hover,
		.eq:hover,
		.note-list a:hover {
			background: var(--surface);
			box-shadow: -8px 0 0 var(--surface);
			color: var(--text);
		}
	}
	/* two columns of a small label over a bold value, 1px dividers between rows */
	.specs {
		margin: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		column-gap: 24px;
	}
	.spec {
		min-width: 0;
		padding: 10px 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-bottom: 1px solid var(--divider);
	}
	dt {
		font-size: 12px;
		color: var(--text-muted);
	}
	dd {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.notes {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
		white-space: pre-wrap;
	}
	/* the pinned note (a surface inset), then the latest dated ones */
	.pinned {
		margin-top: 12px;
		padding: 12px 14px;
		background: var(--surface);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.pin-h {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.pin-h a {
		font-size: 14px;
		font-weight: 800;
	}
	.list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
	}
	.note-list a {
		min-height: 52px;
		padding: 10px 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	.nd {
		font-size: 12px;
		color: var(--text-muted);
	}
	.nt {
		font-size: 14px;
		line-height: 1.4;
		overflow: hidden;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}
	/* routines (#17): what, how much and when, with Done */
	.routines li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		min-height: 60px;
		border-bottom: 1px solid var(--divider);
	}
	.r-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		color: var(--text);
	}
	.r-name {
		font-size: 15px;
		font-weight: 700;
	}
	.r-line {
		font-size: 13px;
		color: var(--text-muted);
	}
	.none {
		margin: 12px 0 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 14px;
	}
	.eq {
		min-height: 48px;
		padding: 10px 0;
		display: flex;
		align-items: center;
		gap: 12px;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	.k {
		width: 72px;
		flex-shrink: 0;
		font-size: 12px;
		color: var(--text-muted);
	}
	.v {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		font-weight: 700;
	}
	/* livestock rows: the name, the count at the end */
	.stock li {
		min-height: 44px;
		padding: 8px 0;
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 15px;
		border-bottom: 1px solid var(--divider);
	}
	.s-name {
		flex: 1;
		min-width: 0;
	}
	.count {
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.plants {
		margin: 12px 0 0;
		font-size: 15px;
		line-height: 1.6;
		color: var(--text-2);
	}
	@media (min-width: 1024px) {
		.body {
			padding: 0 32px 32px;
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			align-items: start;
			max-width: 1100px;
		}
		section {
			padding: 24px 0 16px;
		}
		/* the second column sits past a 2px rule */
		.col:first-child {
			padding-right: 28px;
			border-right: 2px solid var(--divider);
			align-self: stretch;
		}
		.col.side {
			padding-left: 28px;
		}
	}
</style>
