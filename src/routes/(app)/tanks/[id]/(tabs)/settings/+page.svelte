<script lang="ts">
	import { enhance } from '$app/forms';
	import Tip from '$lib/components/Tip.svelte';
	import { TIPS } from '$lib/tips';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import { untrack } from 'svelte';
	import { REVIEW_INTERVALS } from '$lib/review';
	import { fmtDate } from '$lib/time';
	import CoverPicker from './CoverPicker.svelte';
	import { hoursText, scheduleHours } from '$lib/equipment';
	import { GROWING_STYLE_LABEL } from '$lib/types';
	import { setupHref, SETUP_NAV, type SetupItem } from '$lib/shell';
	let { data, form } = $props();
	// what the phone's setup list says beside each section
	const setupMeta = $derived<Partial<Record<SetupItem['key'], string>>>({
		targets: `${data.paramSummary.tracked} tracked`,
		public: data.publicLive ? '● Live' : 'Off',
		sharing: data.counts.members ? `${data.counts.members} ${data.counts.members === 1 ? 'person' : 'people'}` : ''
	});
	// the lighting and CO₂ schedule; with both lights times set the photoperiod is the hours between
	let lightsOn = $state(untrack(() => data.tank.lightsOn));
	let lightsOff = $state(untrack(() => data.tank.lightsOff));
	let co2On = $state(untrack(() => data.tank.co2On));
	let co2Off = $state(untrack(() => data.tank.co2Off));
	let photoperiod = $state(untrack(() => data.tank.photoperiodH));
	const lightsHours = $derived(data.lighting.lights?.hours ?? scheduleHours(lightsOn, lightsOff));
	const co2Hours = $derived(scheduleHours(co2On, co2Off));
	$effect(() => {
		if (lightsHours != null) photoperiod = String(lightsHours);
	});
	let notes = $state(untrack(() => data.tank.notes));
	let startDate = $state(untrack(() => data.tank.startDate));
	const errors = $derived((form?.errors ?? {}) as Record<string, string>);
	const types = [
		{ value: 'freshwater', label: 'Fresh' },
		{ value: 'planted', label: 'Planted' },
		{ value: 'brackish', label: 'Brackish' },
		{ value: 'reef', label: 'Reef' }
	];
</script>

<svelte:head><title>Edit {data.tank.name} · Waterline</title></svelte:head>

<!-- phones: the setup sections the desktop nav lists (the same list, src/lib/shell.ts),
     first, so Targets and the rest are a tap away rather than past the whole form (#270) -->
<nav class="more hide-desk" aria-label="More setup">
	{#each SETUP_NAV.filter((s) => s.key !== 'details') as s (s.key)}
		<a href={setupHref(data.tank.id, s)}><span>{s.label}</span><span class="muted">{setupMeta[s.key] ?? ''} ›</span></a>
	{/each}
</nav>
<form method="POST" action="?/save" enctype="multipart/form-data" class="wrap" use:enhance>
	{#if data.fromReview}<input type="hidden" name="from" value="review" />{/if}
	<!-- the Setup nav beside this page is the shell's; on phones the tank header carries the name -->
	<div class="section-head"><h2>Tank details</h2></div>
	<div class="body">
		<CoverPicker cover={data.tank.cover} coverX={data.tank.coverX} coverY={data.tank.coverY} photos={data.photos} />
		{#if errors.cover}<span class="error-text">✕ {errors.cover}</span>{/if}

		<div class="field">
			<label class="label" for="name">Name</label>
			<input class="input" id="name" name="name" defaultValue={data.tank.name} required maxlength="80" />
			{#if errors.name}<span class="error-text">✕ {errors.name}</span>{/if}
		</div>

		<fieldset class="field">
			<legend class="label">Type</legend>
			<div class="segmented types">
				{#each types as t (t.value)}
					<label><input type="radio" name="type" value={t.value} defaultChecked={data.tank.type === t.value} />{t.label}</label>
				{/each}
			</div>
		</fieldset>

		<div class="pair">
			<div class="field">
				<div class="label-row">
					<label class="label" for="nominalVolume">Nominal volume ({data.volUnit})</label><Tip text={TIPS.nominalVolume} label="About nominal volume" />
				</div>
				<div class="unit-input">
					<input id="nominalVolume" name="nominalVolume" inputmode="decimal" defaultValue={data.tank.nominalVolume} />
					<span class="unit">{data.volUnit}</span>
				</div>
				{#if errors.nominalVolume}<span class="error-text">✕ {errors.nominalVolume}</span>{/if}
			</div>
			<div class="field">
				<div class="label-row">
					<label class="label" for="actualVolume">Actual volume ({data.volUnit}) · after rock, substrate</label><Tip text={TIPS.actualVolume} label="About actual volume" />
				</div>
				<div class="unit-input">
					<input id="actualVolume" name="actualVolume" inputmode="decimal" defaultValue={data.tank.actualVolume} />
					<span class="unit">{data.volUnit}</span>
				</div>
				{#if errors.actualVolume}<span class="error-text">✕ {errors.actualVolume}</span>{/if}
				<a class="hint calc-link" href="/calculators?tank={data.tank.id}#volume">Work it out from the size ›</a>
			</div>
		</div>

		<fieldset class="field">
			<legend class="label">Dimensions · L × W × H ({data.lenUnit})</legend>
			<div class="triple">
				{#each [['length', 'Length'], ['width', 'Width'], ['height', 'Height']] as [key, label] (key)}
					<div class="unit-input">
						<input name={key} inputmode="decimal" aria-label={label} defaultValue={data.tank[key as 'length' | 'width' | 'height']} />
						<span class="unit">{data.lenUnit}</span>
					</div>
				{/each}
			</div>
		</fieldset>

		<div class="pair">
			<div class="field">
				<label class="label" for="specBrand">Tank brand</label>
				<input class="input" id="specBrand" name="specBrand" defaultValue={data.tank.specBrand} maxlength="60" placeholder="e.g. Aqualine" />
			</div>
			<div class="field">
				<label class="label" for="specModel">Model</label>
				<input class="input" id="specModel" name="specModel" defaultValue={data.tank.specModel} maxlength="60" placeholder="e.g. 90P" />
			</div>
			<div class="field">
				<label class="label" for="glass">Glass</label>
				<input class="input" id="glass" name="glass" defaultValue={data.tank.glass} maxlength="60" placeholder="e.g. Low-iron, rimless" />
			</div>
			<div class="field">
				<label class="label" for="waterSource">Water source</label>
				<select class="input" id="waterSource" name="waterSource">
					{#each [['', '—'], ['tap', 'Tap'], ['rodi', 'RODI'], ['mix', 'Mix'], ['well', 'Well']] as [v, l] (v)}
						<option value={v} selected={data.tank.waterSource === v}>{l}</option>
					{/each}
				</select>
			</div>
			{#if data.tank.type === 'planted'}
				<!-- what a planted tank grows on (#96): light, CO₂, fertilizer and substrate together -->
				<div class="section-head growing" id="growing"><h2>Growing setup</h2></div>
				<div class="field">
					<label class="label" for="growingStyle">How it's grown</label>
					<select class="input" id="growingStyle" name="growingStyle">
						{#each [['', '—'], ...Object.entries(GROWING_STYLE_LABEL)] as [v, l] (v)}
							<option value={v} selected={(data.tank.growingStyle ?? '') === v}>{l}</option>
						{/each}
					</select>
					<span class="hint">Changing it leaves the parameters as they are: turn CO₂ or the nutrients on or off in <a href="/tanks/{data.tank.id}/targets">Parameters &amp; targets</a>.</span>
				</div>
			{/if}
			<div class="field">
				<label class="label" for="substrate">Substrate</label>
				<input class="input" id="substrate" name="substrate" defaultValue={data.tank.substrate} maxlength="60" placeholder="e.g. Aquasoil, 3 in" />
			</div>
			<!-- set on the light's or CO₂ item's schedule (#25): shown here, changed on the item -->
			{#if data.lighting.lights}
				<div class="field sched" id="lights">
					<span class="label">Lights on / off</span>
					<input type="hidden" name="lightsOn" value={lightsOn} />
					<input type="hidden" name="lightsOff" value={lightsOff} />
					<input type="hidden" name="photoperiodFixed" value="1" />
					<span class="sched-text">{lightsHours != null ? `${data.lighting.lights.text} · ${hoursText(lightsHours)}` : data.lighting.lights.text}</span>
					<a class="hint sched-link" href="/tanks/{data.tank.id}/equipment/{data.lighting.lights.item.id}">Set on {data.lighting.lights.item.name} ›</a>
				</div>
			{:else}
				<fieldset class="field sched" id="lights">
					<legend class="label">Lights on / off</legend>
					<div class="times">
						<input class="input" type="time" name="lightsOn" aria-label="Lights on" bind:value={lightsOn} aria-invalid={!!errors.lightsOn} />
						<span class="dash" aria-hidden="true">–</span>
						<input class="input" type="time" name="lightsOff" aria-label="Lights off" bind:value={lightsOff} aria-invalid={!!errors.lightsOff} />
						{#if lightsHours != null}<span class="hours">{hoursText(lightsHours)}</span>{/if}
					</div>
					{#if errors.lightsOn || errors.lightsOff}<span class="error-text">✕ {errors.lightsOn ?? errors.lightsOff}</span>{/if}
					<span class="hint">A siesta or several runs a day? Set a schedule on the light under <a href="/tanks/{data.tank.id}/equipment">Equipment</a>.</span>
				</fieldset>
			{/if}
			{#if data.lighting.co2}
				<div class="field sched" id="co2">
					<span class="label">CO₂ on / off</span>
					<input type="hidden" name="co2On" value={co2On} />
					<input type="hidden" name="co2Off" value={co2Off} />
					<span class="sched-text">{data.lighting.co2.hours != null ? `${data.lighting.co2.text} · ${hoursText(data.lighting.co2.hours)}` : data.lighting.co2.text}</span>
					<a class="hint sched-link" href="/tanks/{data.tank.id}/equipment/{data.lighting.co2.item.id}">Set on {data.lighting.co2.item.name} ›</a>
				</div>
			{:else}
				<fieldset class="field sched" id="co2">
					<legend class="label">CO₂ on / off</legend>
					<div class="times">
						<input class="input" type="time" name="co2On" aria-label="CO₂ on" bind:value={co2On} aria-invalid={!!errors.co2On} />
						<span class="dash" aria-hidden="true">–</span>
						<input class="input" type="time" name="co2Off" aria-label="CO₂ off" bind:value={co2Off} aria-invalid={!!errors.co2Off} />
						{#if co2Hours != null}<span class="hours">{hoursText(co2Hours)}</span>{/if}
					</div>
					{#if errors.co2On || errors.co2Off}<span class="error-text">✕ {errors.co2On ?? errors.co2Off}</span>{/if}
				</fieldset>
			{/if}
			<div class="field">
				<label class="label" for="photoperiodH">Photoperiod (h)</label>
				<div class="unit-input">
					<input id="photoperiodH" name="photoperiodH" inputmode="decimal" bind:value={photoperiod} readonly={lightsHours != null} />
					<span class="unit">h</span>
				</div>
				{#if data.lighting.lights}<span class="hint">From the light's schedule.</span>{:else if lightsHours != null}<span class="hint">From the lights' times.</span>{/if}
			</div>
			{#if data.tank.type === 'planted'}
				<div class="field" id="fertilizer">
					<span class="label">Fertilizer</span>
					{#if data.dosing.length}
						<ul class="dosing" aria-label="Dosing routines">
							{#each data.dosing as d (d.id)}
								<li><a href="/tasks/{d.id}"><span class="d-text">{d.text}</span><span class="d-when">{d.interval} · {d.next} ›</span></a></li>
							{/each}
						</ul>
					{:else}
						<span class="hint">No dosing routine yet. A routine's Done logs each dose in History.</span>
					{/if}
					<a class="hint sched-link" href="/tasks/new?tank={data.tank.id}&type=dosing&from={encodeURIComponent(`/tanks/${data.tank.id}/settings`)}">Add a dosing routine ›</a>
				</div>
			{/if}
			<div class="field">
				<label class="label" for="startDate">Start date</label>
				<DateField name="startDate" id="startDate" bind:value={startDate} label="Start date" today={data.today} max={data.today} invalid={!!errors.startDate} />
				{#if errors.startDate}<span class="error-text">✕ {errors.startDate}</span>{/if}
			</div>
			<!-- the setup review (#30): a task every few months to check all this is still right -->
			<div class="field" id="review">
				<label class="label" for="reviewEvery">Setup review</label>
				<select class="input" id="reviewEvery" name="reviewEvery" value={data.review.every}>
					{#each REVIEW_INTERVALS as r (r.days)}<option value={String(r.days)}>{r.label}</option>{/each}
					{#if data.review.custom}<option value={String(data.review.custom)}>Every {data.review.custom} days</option>{/if}
					<option value="off">Off</option>
				</select>
				<span class="hint">
					A reminder to check these details, equipment, targets and livestock are still right{data.review.due ? `. Next ${fmtDate(data.review.due)}` : ''}.
					<a href="/tanks/{data.tank.id}/review">Review now ›</a>
				</span>
			</div>
		</div>

		<div class="field">
			<label class="label" for="notes">Notes</label>
			<textarea class="input" id="notes" name="notes" rows="3" maxlength="2000" bind:value={notes}></textarea>
		</div>

		<!-- a new tank: ammonia and nitrite are stages of the cycle, not failures, until it's running -->
		<label class="check-row cycling">
			<input type="checkbox" name="cycling" defaultChecked={data.tank.cycling} />
			<span><b>This tank is still cycling</b><span class="hint">Ammonia and nitrite above target show as ▲ Cycling, and the dashboard follows the cycle.</span></span>
		</label>

		<div class="foot">
			<button class="btn btn-primary save">Save changes</button>
			<a class="ghost" href="/tanks/{data.tank.id}">Cancel</a>
		</div>


		{#if !data.tank.archived}
			<div class="archive" id="archive">
				<div class="section-head"><h2>Archive</h2></div>
				<p class="hint">History is kept. Archived tanks can be restored from Tanks.</p>
				<button type="button" class="btn btn-warn" popovertarget="confirm-archive">Archive tank</button>
			</div>
		{/if}
	</div>
</form>

<ConfirmDelete
	id="confirm-archive"
	trigger={false}
	title="Archive {data.tank.name}?"
	body="It moves to Archived. The history is kept and you can restore it any time."
	action="?/archive"
	label="Archive"
	tone="warn"
/>

<!-- the getting-started checklist (#82): hidden from the dashboard, back from here -->
{#if !data.tank.archived}
	<form class="start-again" method="POST" action="?/showChecklist" use:enhance>
		<div class="section-head"><h2>Getting started</h2></div>
		<p class="hint">The checklist for a new tank: first test, livestock, plants, lights, a photo. It leaves the dashboard once hidden or once the tank has settled in.</p>
		<button class="btn">Show it on the dashboard</button>
	</form>
{/if}


<style>
	/* Growing setup (#96): a heading inside the form, then its fields */
	.section-head.growing {
		grid-column: 1 / -1;
		margin-top: 8px;
	}
	.dosing {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 2px solid var(--ink);
	}
	.dosing li {
		border-bottom: 1px solid var(--divider);
	}
	.dosing a {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: center;
		min-height: 44px;
		padding: 6px 0;
		color: inherit;
		text-decoration: none;
	}
	.d-text {
		font-weight: 700;
	}
	.d-text,
	.d-when {
		min-width: 0;
	}
	.d-when {
		font-size: 13px;
		color: var(--text-muted);
		text-align: right;
	}
	/* phones: the schedule goes under the routine's name rather than past the edge (#256) */
	@media (max-width: 599px) {
		.dosing a {
			flex-direction: column;
			align-items: flex-start;
			justify-content: center;
			gap: 2px;
		}
		.d-when {
			text-align: left;
		}
	}
	@media (min-width: 600px) {
		.d-when {
			white-space: nowrap;
		}
	}
	.start-again {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
		margin: 0 20px;
	}
	.start-again .hint {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.wrap {
		padding: 20px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.section-head h2 {
		font-size: 22px;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 6px;
	}
	.types label {
		min-width: 0;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px 12px;
	}
	.triple {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
	}
	/* two time pickers need the full width on a phone */
	.sched {
		grid-column: 1 / -1;
	}
	.times {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.times .input {
		flex: 1;
		min-width: 0;
		padding-inline: 8px;
	}
	.dash,
	.hours {
		color: var(--text-muted);
		font-size: 13px;
		white-space: nowrap;
	}
	.hours {
		font-weight: 800;
		color: var(--text);
	}
	.cycling {
		align-items: flex-start;
		padding: 12px 14px;
		background: var(--surface);
		border-left: 3px solid var(--ink);
		font-size: 14px;
	}
	.cycling > span {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.sched-text {
		min-height: 44px;
		display: flex;
		align-items: center;
		font-size: 15px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.hint {
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.hint a {
		font-weight: 800;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-top: 16px;
		border-top: 2px solid var(--divider);
	}
	.save {
		flex: 1;
		height: 52px;
		font-size: 16px;
	}
	.ghost {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 12px;
		font-size: 14px;
		font-weight: 800;
		color: var(--text-muted);
	}
	/* phones: first on the page, outside the form's padding */
	.more {
		display: flex;
		flex-direction: column;
		margin: 20px 20px 0;
		border-top: 2px solid var(--ink);
	}
	.more a {
		min-height: 52px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		border-bottom: 1px solid var(--divider);
		font-size: 16px;
		font-weight: 600;
		color: var(--text);
	}
	.more .muted {
		font-size: 13px;
		font-weight: 400;
	}
	.archive {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 8px;
		scroll-margin-top: 24px;
	}
	.archive .btn {
		align-self: flex-start;
	}
	.archive .hint {
		margin: 0;
	}
	@media (hover: hover) {
		.ghost:hover {
			color: var(--text);
		}
	}
	/* Desktop: beside the shell's Setup nav, max 880 */
	@media (min-width: 1024px) {
		.wrap {
			padding: 24px 32px 48px;
			max-width: 880px;
		}
		.pair {
			gap: 16px;
		}
		.sched {
			grid-column: auto;
		}
		.foot {
			justify-content: flex-start;
		}
		.save {
			flex: none;
			height: 44px;
			font-size: 14px;
			padding: 0 22px;
		}
	}
</style>
