<script lang="ts">
	// Equipment (README → Screens §7): cards with a 2px ink top rule, the type as a
	// kicker, the name, spec tags, a meta line and Log service / Details.
	import { enhance } from '$app/forms';
	import DateField from '$lib/components/DateField.svelte';
	import DayTimeline from '$lib/components/DayTimeline.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ImportButton from '$lib/components/ImportButton.svelte';
	import { parBand } from '$lib/par';
	let { data, form } = $props();
	const parErrors = $derived<Record<string, string>>(form?.par?.errors ?? {});
	const base = $derived(`/tanks/${data.tankHead.id}`);
	// T2: "Last serviced Sep 3 · linked task: Clean canister filter"
	function meta(e: { serviced: string | null; task: string | null }) {
		const s = [e.serviced && `Last serviced ${e.serviced}`, e.task && `linked task: ${e.task}`].filter(Boolean).join(' · ');
		return s && s[0].toUpperCase() + s.slice(1);
	}
	// a maintenance entry for this tank: the form has the equipment picker
	const serviceHref = $derived(`/entries/event/new?tank=${data.tankHead.id}&category=maintenance&from=${encodeURIComponent(`${base}/equipment`)}`);
</script>

<svelte:head><title>Equipment · {data.tankHead.name}</title></svelte:head>

<!-- "+ Add equipment" and "4 items" are in the tab's toolbar (layout) -->
<div class="body">
	{#if data.timeline.length}
		<!-- the day (#25): when each scheduled item runs, with the time now marked -->
		<section class="day" aria-labelledby="day-h">
			<h2 class="kicker" id="day-h">The day</h2>
			<DayTimeline rows={data.timeline} now={data.now} />
		</section>
	{/if}
	{#if data.items.length}
		<div class="grid">
			{#each data.items as e (e.id)}
				<article class="card eq-card">
					<div class="h"><span class="kicker type">{e.type}</span>{#if e.since}<span class="since">since {e.since}</span>{/if}</div>
					<a class="name item" href="{base}/equipment/{e.id}">{e.name}<span class="chev" aria-hidden="true">›</span></a>
					{#if e.summary.length}
						<div class="specs">{#each e.summary as s, i (i)}<span class="tag tag-neutral">{s}</span>{/each}</div>
					{/if}
					{#if e.schedule}
						<div class="sched"><span class="on-now" class:off={!e.schedule.now.on}>{e.schedule.now.text}</span><span class="sched-label">{e.schedule.label}</span></div>
					{/if}
					{#if e.service}<div class="service status-{e.service.level}">{e.service.text}</div>{/if}
					{#if meta(e)}<div class="meta">{meta(e)}</div>{/if}
					<div class="acts">
						<a class="ghost" href={serviceHref}>Log service</a>
						<a class="ghost muted-link" href="{base}/equipment/{e.id}">Details</a>
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<EmptyState
			icon="equipment"
			title="No equipment yet"
			text="Add filters, heaters, lights and more to keep settings and service dates in one place."
			href="{base}/equipment/new"
			label="Add equipment"
			primary
		/>
	{/if}
	{#if data.past.length}
		<details class="past">
			<summary><span class="show">Show past equipment ({data.past.length})</span><span class="hide">Hide past equipment</span></summary>
			<div class="past-list">
				<span class="kicker">Past equipment</span>
				{#each data.past as e (e.id)}
					<div class="past-row"><a href="{base}/equipment/{e.id}">{e.name}</a><span class="muted">{e.type}{e.since ? ` · since ${e.since}` : ''}</span></div>
				{/each}
			</div>
		</details>
	{/if}
	{#if data.withoutOptions.length}
		<!-- a tank can run without a heater or filter on purpose: say so, so it isn't read as missing -->
		<section class="without" aria-labelledby="without-h">
			<h2 class="kicker" id="without-h">Goes without</h2>
			<p class="w-text">Mark what this tank runs without, so no heater reads as a choice, not a gap.</p>
			<div class="w-chips">
				{#each data.withoutOptions as o (o.type)}
					<form method="POST" action="?/without" use:enhance>
						<input type="hidden" name="type" value={o.type} />
						<input type="hidden" name="on" value={o.on ? '0' : '1'} />
						<button class="chip w-chip" class:selected={o.on} aria-pressed={o.on}>{o.on ? '✓ ' : ''}{o.label}</button>
					</form>
				{/each}
			</div>
		</section>
	{/if}
	{#if data.par}
		<!-- PAR readings (#25), reef tanks: the light over the tank as a simple map, latest reading per spot -->
		<section class="par" id="par" aria-labelledby="par-h">
			<h2 class="kicker" id="par-h">Light over the tank · PAR</h2>
			<p class="w-text">PAR readings at spots in the tank, seen from above (the front is at the bottom). The latest reading shows at each spot.</p>
			<div class="par-grid">
				<div class="par-map" style="aspect-ratio: {data.par.aspect}" role="img" aria-label="PAR readings over the tank, seen from above">
					{#each data.par.spots as s (s.id)}
						<div class="dot" style="left: {s.x}%; top: {s.y}%" title="{s.spot} · {s.value}">
							<b>{s.value}</b><span>{s.spot}</span>
						</div>
					{/each}
					{#if !data.par.spots.length}<span class="par-empty">No readings yet</span>{/if}
					<span class="front" aria-hidden="true">Front</span>
				</div>
				<form
					method="POST"
					action="?/par"
					class="par-form"
					use:enhance={({ formElement }) =>
						async ({ result, update }) => {
							await update();
							// saved: clear the reading and its spot name for the next one
							if (result.type === 'redirect') for (const el of formElement.querySelectorAll('input:not([type=hidden])')) (el as HTMLInputElement).value = '';
						}}
				>
					<div class="field">
						<label class="label" for="par-zone">Where</label>
						<select class="input" id="par-zone" name="zone" aria-invalid={!!parErrors.zone}>
							{#each data.par.zones as z (z)}<option value={z}>{z}</option>{/each}
						</select>
						{#if parErrors.zone}<span class="error-text">✕ {parErrors.zone}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="par-value">PAR</label>
						<div class="unit-input">
							<input id="par-value" name="value" inputmode="numeric" autocomplete="off" aria-invalid={!!parErrors.value} />
							<span class="unit">µmol</span>
						</div>
						{#if parErrors.value}<span class="error-text">✕ {parErrors.value}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="par-spot">Spot name · optional</label>
						<input class="input" id="par-spot" name="spot" maxlength="40" autocomplete="off" placeholder="e.g. Acro ledge" />
					</div>
					<div class="field">
						<label class="label" for="par-day">Measured</label>
						<DateField name="day" id="par-day" value={data.par.today} today={data.par.today} max={data.par.today} required label="Measured" />
					</div>
					<button class="btn btn-primary par-save">Add reading</button>
				</form>
			</div>
			{#if data.par.readings.length}
				<ul class="par-list">
					{#each data.par.readings as r (r.id)}
						<li>
							<span class="par-spot">{r.spot}</span>
							<span class="par-val"><b>{r.value}</b> µmol · {parBand(r.value)}</span>
							<span class="par-day">{r.day}</span>
							<form method="POST" action="?/parDelete" use:enhance>
								<input type="hidden" name="id" value={r.id} />
								<button class="btn-text del">Delete<span class="sr-only"> the reading at {r.spot} from {r.day}</span></button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
	<!-- below the list, or below the empty box: in the same place on every tab -->
	<ImportButton href="{base}/import/equipment" />
</div>

<style>
	.body {
		padding: 16px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.grid {
		display: grid;
		gap: 24px;
	}
	/* The day (#25) */
	.day {
		border-top: 2px solid var(--ink);
		padding-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.day h2 {
		margin: 0;
		font-weight: 800;
	}
	.sched {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		font-size: 13px;
	}
	.on-now {
		font-weight: 800;
	}
	.on-now.off {
		color: var(--text-muted);
	}
	.sched-label {
		color: var(--text-2);
		font-variant-numeric: tabular-nums;
	}
	/* PAR map (#25) */
	.par {
		border-top: 2px solid var(--ink);
		padding-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		scroll-margin-top: 16px;
	}
	.par h2 {
		margin: 0;
		font-weight: 800;
	}
	.par-grid {
		display: grid;
		gap: 16px;
	}
	.par-map {
		position: relative;
		width: 100%;
		max-width: 520px;
		background: var(--surface);
		border: 2px solid var(--ink);
		overflow: hidden;
	}
	.dot {
		position: absolute;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		pointer-events: none;
	}
	.dot b {
		min-width: 36px;
		padding: 2px 6px;
		background: var(--ink);
		color: var(--bg);
		font-size: 13px;
		font-weight: 800;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	.dot span {
		font-size: 11px;
		color: var(--text-2);
		white-space: nowrap;
	}
	.par-empty {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 13px;
		color: var(--text-muted);
	}
	.front {
		position: absolute;
		right: 6px;
		bottom: 4px;
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.par-form {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		align-content: start;
	}
	.par-form .input,
	.par-form .unit-input {
		min-height: 44px;
	}
	.par-save {
		grid-column: 1 / -1;
		justify-self: start;
		min-height: 44px;
	}
	.par-list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--divider);
	}
	.par-list li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 2px 12px;
		align-items: center;
		min-height: 44px;
		padding: 8px 0;
		border-bottom: 1px solid var(--divider);
		font-size: 13px;
	}
	.par-spot {
		font-weight: 700;
		font-size: 14px;
	}
	.par-val {
		grid-column: 1;
		color: var(--text-2);
	}
	.par-day {
		grid-column: 1;
		color: var(--text-muted);
		font-size: 12px;
	}
	.par-list form {
		grid-column: 2;
		grid-row: 1 / span 3;
	}
	.del {
		color: var(--text-muted);
		font-size: 13px;
		min-height: 44px;
	}
	@media (min-width: 720px) {
		.par-grid {
			grid-template-columns: minmax(0, 1fr) 320px;
			align-items: start;
		}
	}
	/* Goes without: under a 2px rule, chips that turn on "No heater" */
	.without {
		border-top: 2px solid var(--ink);
		padding-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.without h2 {
		margin: 0;
		font-weight: 800;
	}
	.w-text {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.w-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.w-chip {
		min-height: 44px;
	}
	.eq-card {
		padding: 12px 0 4px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		color: var(--text);
	}
	.h {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}
	.type {
		font-weight: 800;
	}
	.since {
		font-size: 12px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.name {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: 20px;
		font-weight: 800;
		line-height: 1.2;
		color: var(--text);
		letter-spacing: -0.015em;
	}
	.name:hover {
		color: var(--accent-text);
	}
	.chev {
		font-size: 16px;
		font-weight: 400;
		color: var(--neutral-600);
	}
	.specs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.specs .tag {
		font-size: 12px;
	}
	.meta {
		font-size: 13px;
		color: var(--text-2);
	}
	.service {
		font-size: 13px;
		font-weight: 800;
	}
	.service + .meta {
		margin-top: -6px;
	}
	.acts {
		display: flex;
		gap: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--divider);
	}
	.ghost {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin: -6px 0;
		padding: 0 4px;
		font-size: 14px;
		font-weight: 800;
		color: var(--accent-text);
	}
	.muted-link {
		color: var(--text-muted);
	}
	/* "Show past …" works the same on Equipment and Livestock */
	.past {
		display: flex;
		flex-direction: column;
		border-top: 2px solid var(--divider);
	}
	.past summary {
		list-style: none;
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 4px;
		font-size: 14px;
		font-weight: 800;
		color: var(--accent-text);
		cursor: pointer;
	}
	.past summary::-webkit-details-marker {
		display: none;
	}
	.past[open] .show,
	.past:not([open]) .hide {
		display: none;
	}
	.past-list {
		display: flex;
		flex-direction: column;
	}
	.past-list .kicker {
		padding: 4px 0 6px;
	}
	.past-row {
		padding: 8px 0;
		display: flex;
		justify-content: space-between;
		gap: 12px;
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
	}
	.past-row a {
		color: var(--text);
		font-weight: 600;
	}
	.past .muted {
		font-size: 13px;
		white-space: nowrap;
	}
	@media (hover: hover) {
		.ghost:hover,
		.past summary:hover {
			background: color-mix(in srgb, var(--accent) 10%, transparent);
			color: var(--accent-text);
		}
		.past-row a:hover {
			color: var(--accent-text);
		}
	}
	@media (min-width: 1024px) {
		.body {
			padding: 24px 32px 48px;
		}
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		}
	}
</style>
