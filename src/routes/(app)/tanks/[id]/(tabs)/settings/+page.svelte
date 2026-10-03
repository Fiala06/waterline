<script lang="ts">
	import { enhance } from '$app/forms';
	import Tip from '$lib/components/Tip.svelte';
	import { TIPS } from '$lib/tips';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import { dragFocus, photoUrl } from '$lib/media';
	import { untrack } from 'svelte';
	import { REVIEW_INTERVALS } from '$lib/review';
	import { fmtDate } from '$lib/time';
	import TankDetailsSections from '$lib/components/TankDetailsSections.svelte';
	import { hoursText, scheduleHours } from '$lib/equipment';
	let { data, form } = $props();
	// the lighting and CO₂ schedule; with both lights times set the photoperiod is the hours between
	let lightsOn = $state(untrack(() => data.tank.lightsOn));
	let lightsOff = $state(untrack(() => data.tank.lightsOff));
	let co2On = $state(untrack(() => data.tank.co2On));
	let co2Off = $state(untrack(() => data.tank.co2Off));
	let photoperiod = $state(untrack(() => data.tank.photoperiodH));
	const lightsHours = $derived(scheduleHours(lightsOn, lightsOff));
	const co2Hours = $derived(scheduleHours(co2On, co2Off));
	$effect(() => {
		if (lightsHours != null) photoperiod = String(lightsHours);
	});
	let coverPreview = $state<string | null>(null);
	let notes = $state(untrack(() => data.tank.notes));
	let startDate = $state(untrack(() => data.tank.startDate));
	function pickCover(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (coverPreview) URL.revokeObjectURL(coverPreview);
		coverPreview = f ? URL.createObjectURL(f) : null;
		// a new photo starts in the middle
		focus = { x: 50, y: 50 };
		moved = !!f;
	}

	// Drag the cover to choose which part shows, as on Facebook; it's saved
	// with the rest (Save changes). Arrow keys move it too.
	let focus = $state(untrack(() => ({ x: data.tank.coverX, y: data.tank.coverY })));
	let moved = $state(false);
	// once saved: where it is now, nothing left to save
	$effect(() => {
		const saved = { x: data.tank.coverX, y: data.tank.coverY, cover: data.tank.cover };
		untrack(() => {
			focus = { x: saved.x, y: saved.y };
			moved = false;
			if (coverPreview) URL.revokeObjectURL(coverPreview);
			coverPreview = null;
		});
	});
	let frame = $state<HTMLElement>();
	let img = $state<HTMLImageElement>();
	let drag: { id: number; x: number; y: number; start: { x: number; y: number } } | null = null;
	const sizes = () =>
		frame && img?.naturalWidth
			? { frame: { w: frame.clientWidth, h: frame.clientHeight }, natural: { w: img.naturalWidth, h: img.naturalHeight } }
			: null;
	function down(e: PointerEvent) {
		if (!img || (e.target as HTMLElement).closest('.change')) return;
		drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: { ...focus } };
		// the photo keeps the pointer while it moves, even off its edge
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		e.preventDefault();
	}
	function move(e: PointerEvent) {
		const z = sizes();
		if (!drag || drag.id !== e.pointerId || !z) return;
		focus = dragFocus(drag.start, { dx: e.clientX - drag.x, dy: e.clientY - drag.y }, z.frame, z.natural);
		moved = true;
	}
	function up(e: PointerEvent) {
		if (drag?.id === e.pointerId) drag = null;
	}
	function key(e: KeyboardEvent) {
		const step = e.shiftKey ? 10 : 2;
		const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
		if (!d) return;
		e.preventDefault();
		focus = { x: Math.min(100, Math.max(0, focus.x + d[0])), y: Math.min(100, Math.max(0, focus.y + d[1])) };
		moved = true;
	}
	const errors = $derived((form?.errors ?? {}) as Record<string, string>);
	const types = [
		{ value: 'freshwater', label: 'Fresh' },
		{ value: 'planted', label: 'Planted' },
		{ value: 'brackish', label: 'Brackish' },
		{ value: 'reef', label: 'Reef' }
	];
</script>

<svelte:head><title>Edit {data.tank.name} · Waterline</title></svelte:head>

<form method="POST" action="?/save" enctype="multipart/form-data" class="wrap" use:enhance>
	{#if data.fromReview}<input type="hidden" name="from" value="review" />{/if}
	<!-- the Setup nav beside this page is the shell's; on phones the tank header carries the name -->
	<div class="section-head"><h2>Tank details</h2></div>
	<div class="body">
		<div class="cover" class:photo-placeholder={!coverPreview && !data.tank.cover} class:movable={coverPreview || data.tank.cover} bind:this={frame}>
			{#if coverPreview || data.tank.cover}
				<!-- dragged, or moved with the arrow keys; its label says so -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
				<img
					bind:this={img}
					src={coverPreview ?? photoUrl(data.tank.cover!, 'full')}
					alt="Tank cover. Drag, or use the arrow keys, to choose which part shows."
					style:object-position="{focus.x}% {focus.y}%"
					draggable="false"
					tabindex="0"
					onpointerdown={down}
					onpointermove={move}
					onpointerup={up}
					onpointercancel={up}
					onkeydown={key}
				/>
				<span class="drag-hint" aria-hidden="true">✥ Drag to reposition</span>
				<input type="hidden" name="coverX" value={focus.x} />
				<input type="hidden" name="coverY" value={focus.y} />
			{/if}
			<label class="change btn">
				Change cover
				<input type="file" name="cover" accept="image/*" onchange={pickCover} />
			</label>
		</div>
		{#if moved}<span class="moved" aria-live="polite">Save changes to keep it there.</span>{/if}
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
				<label class="label" for="substrate">Substrate</label>
				<input class="input" id="substrate" name="substrate" defaultValue={data.tank.substrate} maxlength="60" placeholder="e.g. Aquasoil, 3 in" />
			</div>
			<div class="field">
				<label class="label" for="waterSource">Water source</label>
				<select class="input" id="waterSource" name="waterSource">
					{#each [['', '—'], ['tap', 'Tap'], ['rodi', 'RODI'], ['mix', 'Mix'], ['well', 'Well']] as [v, l] (v)}
						<option value={v} selected={data.tank.waterSource === v}>{l}</option>
					{/each}
				</select>
			</div>
			<fieldset class="field sched">
				<legend class="label">Lights on / off</legend>
				<div class="times">
					<input class="input" type="time" name="lightsOn" aria-label="Lights on" bind:value={lightsOn} aria-invalid={!!errors.lightsOn} />
					<span class="dash" aria-hidden="true">–</span>
					<input class="input" type="time" name="lightsOff" aria-label="Lights off" bind:value={lightsOff} aria-invalid={!!errors.lightsOff} />
					{#if lightsHours != null}<span class="hours">{hoursText(lightsHours)}</span>{/if}
				</div>
				{#if errors.lightsOn || errors.lightsOff}<span class="error-text">✕ {errors.lightsOn ?? errors.lightsOff}</span>{/if}
			</fieldset>
			<fieldset class="field sched">
				<legend class="label">CO₂ on / off</legend>
				<div class="times">
					<input class="input" type="time" name="co2On" aria-label="CO₂ on" bind:value={co2On} aria-invalid={!!errors.co2On} />
					<span class="dash" aria-hidden="true">–</span>
					<input class="input" type="time" name="co2Off" aria-label="CO₂ off" bind:value={co2Off} aria-invalid={!!errors.co2Off} />
					{#if co2Hours != null}<span class="hours">{hoursText(co2Hours)}</span>{/if}
				</div>
				{#if errors.co2On || errors.co2Off}<span class="error-text">✕ {errors.co2On ?? errors.co2Off}</span>{/if}
			</fieldset>
			<div class="field">
				<label class="label" for="photoperiodH">Photoperiod (h)</label>
				<div class="unit-input">
					<input id="photoperiodH" name="photoperiodH" inputmode="decimal" bind:value={photoperiod} readonly={lightsHours != null} />
					<span class="unit">h</span>
				</div>
				{#if lightsHours != null}<span class="hint">From the lights' times.</span>{/if}
			</div>
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

		<!-- phones: the setup sections the desktop nav lists -->
		<nav class="more hide-desk" aria-label="More setup">
			<a href="/tanks/{data.tank.id}/targets"><span>Parameters &amp; targets</span><span class="muted">{data.paramSummary.tracked} tracked ›</span></a>
			<a href="/tanks/{data.tank.id}/public"><span>Public page</span><span class="muted">{data.publicLive ? '● Live' : 'Off'} ›</span></a>
			<a href="/tanks/{data.tank.id}/remind"><span>Reminders</span><span class="muted">›</span></a>
			<a href="/tanks/{data.tank.id}/review"><span>Setup review</span><span class="muted">›</span></a>
		</nav>

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

<!-- Specs, notes and routines (the same sections as Notes & routines), after the form -->
<div class="details-more" id="details-more">
	<TankDetailsSections tankId={data.tank.id} tankName={data.tank.name} details={data.details} editHref="#specBrand" from="/tanks/{data.tank.id}/settings" />
</div>

<style>
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
	.cover {
		position: relative;
		height: 200px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		background: var(--surface);
	}
	.cover img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	/* drag the photo to move it in its frame */
	.movable img {
		cursor: grab;
		touch-action: none;
		user-select: none;
		-webkit-user-drag: none;
	}
	.movable img:active {
		cursor: grabbing;
	}
	.movable img:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.drag-hint {
		position: absolute;
		left: 12px;
		bottom: 12px;
		padding: 6px 10px;
		background: var(--ink);
		color: var(--bg);
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		pointer-events: none;
	}
	.moved {
		margin-top: -10px;
		font-size: 13px;
		color: var(--text-muted);
	}
	.change {
		position: absolute;
		right: 12px;
		bottom: 12px;
		background: var(--bg);
		cursor: pointer;
	}
	.change input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.change:focus-within {
		outline: 2px solid var(--accent);
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
	.more {
		display: flex;
		flex-direction: column;
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
	.details-more {
		padding: 0 20px calc(24px + env(safe-area-inset-bottom));
		border-top: 2px solid var(--divider);
		margin: 0 20px;
		padding-inline: 0;
	}
	/* Desktop: beside the shell's Setup nav, max 880 */
	@media (min-width: 1024px) {
		.wrap {
			padding: 24px 32px 48px;
			max-width: 880px;
		}
		.details-more {
			margin: 0 32px;
			max-width: 816px;
			padding-bottom: 48px;
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
