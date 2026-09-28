<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import RemindMe from '$lib/components/RemindMe.svelte';
	import { enhance } from '$app/forms';
	import { photoUrl } from '$lib/media';
	let { data } = $props();
	const base = $derived(`/tanks/${data.tankHead.id}`);
	const cover = $derived(data.tankHead.cover);
	const newRoutine = (type: 'dosing' | 'feeding') => `/tasks/new?tank=${data.tankHead.id}&type=${type}&from=${encodeURIComponent(base)}`;
</script>

<svelte:head><title>{data.tankHead.name} · Waterline</title></svelte:head>

<div class="body">
	<div class="col">
		<!-- phones show the cover full-bleed above the name (layout) -->
		<div class="banner hide-phone" class:photo-placeholder={!cover}>
			{#if cover}<img src={photoUrl(cover, 'full')} alt="" />{:else}<span class="mono">cover photo</span>{/if}
		</div>
		<section>
			<div class="sh"><h2>Specs</h2>{#if data.specs.length}<a href="{base}/settings">Edit ›</a>{/if}</div>
			{#if data.specs.length}
				<dl class="card specs">
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
			<div class="sh">
				<h2 id="notes-h">Notes</h2>
				{#if data.recentNotes.length}<a href="/history?tank={data.tankHead.id}&cat=note&range=all">All ›</a>{/if}
			</div>
			{#if data.notes}
				<div class="card pinned">
					<div class="pin-h"><span class="caps">Pinned</span><a href="{base}/settings#notes">Edit</a></div>
					<p class="notes">{data.notes}</p>
				</div>
			{/if}
			{#if data.recentNotes.length}
				<ul class="card list note-list">
					{#each data.recentNotes as n (n.id)}
						<li><a href="/entries/event/{n.id}"><span class="nd">{n.day}</span><span class="nt">{n.text}</span></a></li>
					{/each}
				</ul>
			{:else if !data.notes}
				<p class="none">Dated notes about this tank, newest first. They're in History too.</p>
			{/if}
			<div class="note-acts">
				<a class="btn" href="/entries/event/new?tank={data.tankHead.id}&category=note&from={encodeURIComponent(base)}">Add note</a>
				<RemindMe tankId={data.tankHead.id} tankName={data.tankHead.name} today={data.today} />
			</div>
		</section>
		<section aria-labelledby="routines-h">
			<div class="sh">
				<h2 id="routines-h">Routines{data.routines.length ? ` · ${data.routines.length}` : ''}</h2>
				{#if data.routines.length}<a href="/tasks?filter={data.tankHead.id}">All ›</a>{/if}
			</div>
			{#if data.routines.length}
				<ul class="card list routines">
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
			<div class="note-acts">
				<a class="btn" href={newRoutine('dosing')}>Add dosing</a>
				<a class="btn" href={newRoutine('feeding')}>Add feeding</a>
			</div>
		</section>
	</div>
	<div class="col">
		<section>
			<div class="sh">
				<h2>Equipment{data.equipment.length ? ` · ${data.equipment.length}` : ''}</h2>
				{#if data.equipment.length}<a href="{base}/equipment">All ›</a>{/if}
			</div>
			{#if data.equipment.length}
				<div class="card list">
					{#each data.equipment as e (e.id)}
						<a class="eq" href="{base}/equipment/{e.id}"><span class="k">{e.type}</span><span class="v">{e.name}</span></a>
					{/each}
				</div>
			{:else}
				<EmptyState compact icon="equipment" title="None added yet" href="{base}/equipment/new" label="Add equipment" />
			{/if}
		</section>

		<section>
			<div class="sh">
				<h2>Livestock{data.livestock.length ? ` · ${data.animals} in ${data.species} species` : ''}</h2>
				{#if data.livestock.length}<a href="{base}/livestock">All ›</a>{/if}
			</div>
			{#if data.livestock.length}
				<ul class="stock">
					{#each data.livestock as l (l.id)}
						<li>
							{l.name}<span class="count num">{l.count}</span>
							{#if l.quarantine}<span class="status-tag tag-warn sm">▲ Quarantine</span>{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<EmptyState compact icon="livestock" title="None added yet" href="{base}/livestock/new" label="Add livestock" />
			{/if}
		</section>

		<section>
			<div class="sh">
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
			<div class="sh"><h2>Ask an AI assistant</h2></div>
			<a class="card ai" href="{base}/summary">
				<span class="ai-text">
					<span class="ai-t">Summary for an AI assistant</span>
					<span class="ai-s">This tank's readings, care log and stocking as text, to paste into ChatGPT, Claude or Gemini with your question.</span>
				</span>
				<span class="chev" aria-hidden="true">›</span>
			</a>
		</section>
	</div>
</div>

<style>
	.body {
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.sh {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}
	.sh h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.ai {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
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
		font-weight: 600;
	}
	.ai-s {
		font-size: 13px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.chev {
		font-size: 20px;
		color: var(--text-faint);
	}
	@media (hover: hover) {
		.ai:hover {
			border-color: var(--border-strong);
		}
	}
	/* a 44px tap target that doesn't make the header taller */
	.sh a {
		flex-shrink: 0;
		font-size: 14px;
		font-weight: 600;
		padding: 12px 0 12px 16px;
		margin: -12px 0 -12px -16px;
	}
	/* T1: two columns of small label over bold value */
	.specs {
		margin: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1px;
		background: var(--border);
		overflow: hidden;
	}
	.spec {
		min-width: 0;
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--surface);
	}
	.spec:last-child:nth-child(odd) {
		grid-column: 1 / -1;
	}
	dt {
		font-size: 12px;
		color: var(--text-muted);
	}
	dd {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.notes {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
		white-space: pre-wrap;
	}
	/* the pinned note, then the latest dated ones */
	.pinned {
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.pin-h {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.pin-h a {
		font-size: 14px;
		letter-spacing: normal;
		text-transform: none;
	}
	.note-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.note-list li + li {
		border-top: 1px solid var(--border);
	}
	.note-list a {
		min-height: 52px;
		padding: 10px 14px;
		display: flex;
		flex-direction: column;
		gap: 2px;
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
	.routines {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.routines li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 14px;
		min-height: 60px;
	}
	.routines li + li {
		border-top: 1px solid var(--border);
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
		font-weight: 600;
	}
	.r-line {
		font-size: 13px;
		color: var(--text-muted);
	}
	.routines .btn {
		min-height: 44px;
		padding: 0 16px;
	}
	.none {
		margin: 0;
		font-size: 14px;
		color: var(--text-faint);
	}
	.note-acts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.list {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.eq {
		min-height: 44px;
		padding: 12px 14px;
		display: flex;
		align-items: center;
		gap: 12px;
		color: var(--text);
	}
	.eq + .eq {
		border-top: 1px solid var(--border);
	}
	.eq:hover {
		color: var(--text);
		background: var(--surface-hi);
	}
	.k {
		width: 64px;
		flex-shrink: 0;
		font-size: 12px;
		color: var(--text-muted);
	}
	.v {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		font-weight: 600;
	}
	/* T1: livestock as chips with the count in accent */
	.stock {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.stock li {
		min-height: 36px;
		padding: 0 12px;
		border-radius: 10px;
		background: var(--surface);
		border: 1px solid var(--border);
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
	}
	.count {
		font-weight: 700;
		color: var(--accent);
	}
	.plants {
		margin: 0;
		font-size: 15px;
		line-height: 1.6;
		color: var(--text-2);
	}
	.banner {
		position: relative;
		height: 200px;
		border-radius: 16px;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		color: var(--text-faint);
	}
	.banner img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	@media (min-width: 1024px) {
		.body {
			padding: 24px 32px;
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 28px;
			align-items: start;
			max-width: 1100px;
		}
		.col {
			gap: 22px;
		}
	}
</style>
