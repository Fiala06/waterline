<script lang="ts">
	// Specs (read-only, Edit opens the form), the pinned note with the latest
	// dated notes, and the dosing and feeding routines with Done: on Notes &
	// routines (/tanks/[id]) and again at the end of Setup › Details. Each is a
	// section head over a 2px ink rule with rows divided by 1px lines.
	import { enhance } from '$app/forms';
	import EmptyState from './EmptyState.svelte';
	import RemindMe from './RemindMe.svelte';
	import type { TankDetails } from '$lib/server/tank-details';

	let {
		tankId,
		tankName,
		details,
		editHref,
		from = `/tanks/${tankId}`
	}: {
		tankId: string;
		tankName: string;
		details: Omit<TankDetails, 'today'> & { today: string };
		/** where Edit and Add specs go: the Details form (an anchor scrolls to its spec fields) */
		editHref: string;
		/** where Done and the Add buttons come back to */
		from?: string;
	} = $props();
	const base = $derived(`/tanks/${tankId}`);
	const newRoutine = (type: 'dosing' | 'feeding') => `/tasks/new?tank=${tankId}&type=${type}&from=${encodeURIComponent(from)}`;
</script>

<section aria-labelledby="specs-h">
	<div class="section-head"><h2 id="specs-h">Specs</h2>{#if details.specs.length}<a href={editHref}>Edit ›</a>{/if}</div>
	{#if details.specs.length}
		<dl class="specs">
			{#each details.specs as [k, v] (k)}<div class="spec"><dt>{k}</dt><dd>{v}</dd></div>{/each}
		</dl>
	{:else}
		<EmptyState compact icon="tank" title="None added yet" text="Add the tank model, size, glass, substrate and light hours in Settings." href={editHref} label="Add specs" />
	{/if}
</section>
<section aria-labelledby="notes-h">
	<div class="section-head">
		<h2 id="notes-h">Notes</h2>
		{#if details.recentNotes.length}<a href="/history?tank={tankId}&cat=note&range=all">All ›</a>{/if}
	</div>
	{#if details.notes}
		<div class="pinned">
			<div class="pin-h"><span class="kicker">Pinned</span><a href="{base}/settings#notes">Edit</a></div>
			<p class="notes">{details.notes}</p>
		</div>
	{/if}
	{#if details.recentNotes.length}
		<ul class="list note-list">
			{#each details.recentNotes as n (n.id)}
				<li><a href="/entries/event/{n.id}"><span class="nd">{n.day}</span><span class="nt">{n.text}</span></a></li>
			{/each}
		</ul>
	{:else if !details.notes}
		<p class="none">Dated notes about this tank, newest first. They're in History too.</p>
	{/if}
	<div class="acts">
		<a class="btn" href="/entries/event/new?tank={tankId}&category=note&from={encodeURIComponent(from)}">Add note</a>
		<RemindMe {tankId} {tankName} today={details.today} />
	</div>
</section>
<section aria-labelledby="routines-h">
	<div class="section-head">
		<h2 id="routines-h">Routines{details.routines.length ? ` · ${details.routines.length}` : ''}</h2>
		{#if details.routines.length}<a href="/tasks?filter={tankId}">All ›</a>{/if}
	</div>
	{#if details.routines.length}
		<ul class="list routines">
			{#each details.routines as r (r.id)}
				<li>
					<a class="r-text" href="/tasks/{r.id}">
						<span class="r-name">{r.name}</span>
						<span class="r-line">{r.line} · <span class={r.level === 'ok' ? '' : `status-${r.level}`}>{r.due}</span></span>
					</a>
					<form method="POST" action="/tasks?/done" use:enhance>
						<input type="hidden" name="taskId" value={r.id} />
						<input type="hidden" name="from" value={from} />
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
		<!-- maintenance routines (#92): a sequence of log steps, run in order -->
		<a class="btn" href="/tanks/{tankId}/routines">Maintenance routines{details.maintenanceRoutines ? ` · ${details.maintenanceRoutines}` : ''}</a>
	</div>
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		padding: 18px 0 10px;
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
	@media (hover: hover) {
		.note-list a:hover {
			background: var(--surface);
			box-shadow: -8px 0 0 var(--surface);
			color: var(--text);
		}
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
	@media (min-width: 1024px) {
		section {
			padding: 24px 0 16px;
		}
	}
</style>
