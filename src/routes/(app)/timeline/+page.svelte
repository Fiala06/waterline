<script lang="ts">
	// Timeline (#26): under each month's 2px rule, the photos in date order;
	// beside each, the day, what lived in the tank and the nearest test's
	// readings (icon + word); between two, how long and what happened.
	// Compare picks two photos: side by side, with a slider when scripts run.
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { photoUrl } from '$lib/media';
	let { data } = $props();
	const q = $derived(data.tank ? `?tank=${data.tank.id}` : '');
	const base = $derived(`/timeline${q}`);
	const link = (params: Record<string, string>) => `${base}${q ? '&' : '?'}${new URLSearchParams(params)}`;
	let js = $state(false);
	onMount(() => (js = true));
	// the slider: how much of the later photo shows over the earlier one
	let split = $state(50);
	const stats = (e: { dayNumber: number | null; animals: number; plants: number }) =>
		[e.dayNumber ? `Day ${e.dayNumber}` : null, e.animals ? `${e.animals} animal${e.animals === 1 ? '' : 's'}` : null, e.plants ? `${e.plants} plant${e.plants === 1 ? '' : 's'}` : null]
			.filter(Boolean)
			.join(' · ');
</script>

<svelte:head><title>Timeline · {data.tank?.name ?? 'Waterline'}</title></svelte:head>

{#snippet readings(list: { name: string; value: string; unit: string; level: string; status: string }[] | null, tested: string | null, testId: string | null)}
	{#if list?.length}
		<div class="rds">
			{#each list as r (r.name)}
				<span class="rd" class:bad={r.level === 'bad'}><span class="rn">{r.name}</span><span class="rv num">{r.value}{r.unit ? ` ${r.unit}` : ''}</span><span class="rs status-{r.level}">{r.status}</span></span>
			{/each}
		</div>
		{#if tested}<span class="tested">{#if testId}<a href="/entries/test/{testId}">{tested[0].toUpperCase() + tested.slice(1)}</a>{:else}{tested}{/if}</span>{/if}
	{:else}
		<span class="tested">– No test near this photo</span>
	{/if}
{/snippet}

<div class="page">
	<div class="phead hide-desk">
		<a class="back sub-back" href="/photos{q}">‹ Photos</a>
		<h1 class="title">Timeline</h1>
	</div>
	{#if !data.tank}
		<p class="lede">Add a tank first.</p>
	{:else if !data.count}
		<div class="empty">
			<p>No photos in the timeline yet. Photos you add to notes and tests, or upload to Photos, line up here by the day they were taken, with the readings and the stock of that moment.</p>
			<a class="btn" href="/photos{q}">Go to Photos</a>
		</div>
	{:else}
		{#if data.compare}
			{@const c = data.compare}
			<section class="compare" aria-labelledby="cmp-h">
				<div class="cmp-head">
					<h2 class="kicker" id="cmp-h">Before and after · {c.label}</h2>
					<a class="btn" href={base}>Done comparing</a>
				</div>
				{#if js}
					<!-- the later photo over the earlier one, cut where the slider sits -->
					<div class="slider" style:--split="{split}%">
						<img class="under" src={photoUrl(c.a.id, 'full')} alt="{c.a.date}, before" />
						<img class="over" src={photoUrl(c.b.id, 'full')} alt="{c.b.date}, after" />
						<span class="handle" aria-hidden="true"></span>
						<label class="sr-only" for="split">Slide between before and after</label>
						<input id="split" type="range" min="0" max="100" bind:value={split} />
						<span class="tag-a">{c.a.date}</span>
						<span class="tag-b">{c.b.date}</span>
					</div>
				{/if}
				<div class="pair">
					{#each [c.a, c.b] as e, i (e.id)}
						<div class="side">
							<a class="shot" href="/photos/{e.id}"><img src={photoUrl(e.id, 'full')} alt="{e.date}, {i ? 'after' : 'before'}" /></a>
							<span class="when"><b>{i ? 'After' : 'Before'} · {e.date}</b>{stats(e) ? ` · ${stats(e)}` : ''}</span>
							{@render readings(e.readings, e.tested, e.testId)}
						</div>
					{/each}
				</div>
				<p class="changed"><b>In between:</b> {c.summary || 'nothing logged between these two photos'}.</p>
			</section>
		{:else if data.selected}
			<p class="picking" role="status">Comparing from <b>{data.months.flatMap((m) => m.entries).find((e) => e.id === data.selected)?.date}</b>: pick the second photo. <a href={base}>Cancel</a></p>
		{/if}

		<p class="lede">
			{data.count} photo{data.count === 1 ? '' : 's'} in date order, each with the readings and stock of that moment. Compare puts two side by side. A photo that doesn't show the tank can be left out from its page.
		</p>
		{#each data.months as m (m.key)}
			<section class="month" aria-label={m.label}>
				<h2 class="kicker">{m.label}</h2>
				{#each m.entries as e (e.id)}
					{#if e.gap}
						<div class="gap">
							<span class="gap-days">{e.gap.label}</span>
							{#if e.gap.summary}<span class="gap-what">{e.gap.summary}</span>{/if}
						</div>
					{/if}
					<article class="entry" class:selected={data.selected === e.id} id="p-{e.id}">
						<a class="thumb" href="/photos/{e.id}"><img src={photoUrl(e.id)} alt="Photo from {e.date}" loading="lazy" /></a>
						<div class="info">
							<h3 class="date">{e.date}</h3>
							{#if stats(e)}<span class="stats">{stats(e)}</span>{/if}
							{@render readings(e.readings, e.tested, e.testId)}
							<div class="acts">
								{#if data.selected === e.id}
									<span class="picked">✓ Picked · <a href={base}>Cancel</a></span>
								{:else if data.selected}
									<a class="btn-text" href={link({ a: data.selected, b: e.id })}>Compare with this</a>
								{:else}
									<a class="btn-text" href={link({ a: e.id })}>Compare</a>
								{/if}
							</div>
						</div>
					</article>
				{/each}
			</section>
		{/each}
	{/if}
</div>

<style>
	.page {
		padding: 8px 20px 32px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 1040px;
	}
	.phead {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.title {
		margin: 0;
		font-size: 28px;
	}
	.lede {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
		max-width: 640px;
	}
	.kicker {
		margin: 0;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		font-weight: 800;
	}
	.empty {
		border-top: 2px solid var(--ink);
		padding: 24px 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 14px;
	}
	.empty p {
		margin: 0;
		font-size: 14px;
		color: var(--text-2);
		max-width: 560px;
	}
	.picking {
		margin: 0;
		padding: 10px 14px;
		border: 2px solid var(--ink);
		font-size: 14px;
	}
	.month {
		display: flex;
		flex-direction: column;
	}
	/* the photo and its moment: 160px thumb beside the stats */
	.entry {
		display: grid;
		grid-template-columns: 160px minmax(0, 1fr);
		gap: 16px;
		padding: 14px 0;
		border-bottom: 1px solid var(--divider);
	}
	.entry.selected {
		outline: 2px solid var(--accent);
		outline-offset: 4px;
	}
	.thumb img {
		display: block;
		width: 160px;
		height: 160px;
		object-fit: cover;
		background: var(--surface);
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.date {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
	}
	.stats,
	.tested {
		font-size: 13px;
		color: var(--text-muted);
	}
	.tested a {
		color: inherit;
		text-decoration: underline;
	}
	.rds {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 18px;
	}
	.rd {
		display: grid;
		grid-template-areas: 'n' 'v' 's';
		gap: 1px;
		min-width: 64px;
	}
	.rn {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}
	.rv {
		font-size: 16px;
		font-weight: 800;
	}
	.rd.bad .rv {
		color: var(--bad);
	}
	.rs {
		font-size: 12px;
		font-weight: 700;
		white-space: nowrap;
	}
	.acts {
		margin-top: auto;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.acts .btn-text {
		min-height: 44px;
		padding: 0;
		font-size: 14px;
	}
	.picked {
		font-size: 14px;
		font-weight: 700;
	}
	/* between two photos: a rule down the thumb column, the time and the changes */
	.gap {
		display: grid;
		grid-template-columns: 160px minmax(0, 1fr);
		gap: 16px;
		padding: 8px 0;
		border-bottom: 1px solid var(--divider);
		font-size: 13px;
		color: var(--text-muted);
		background: var(--surface);
	}
	.gap-days {
		padding-left: 12px;
		border-left: 2px solid var(--ink);
		font-weight: 700;
		color: var(--text);
	}
	.gap-what {
		color: var(--text-2);
	}
	/* before and after */
	.compare {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.cmp-head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px;
		border-bottom: 2px solid var(--ink);
	}
	.cmp-head .kicker {
		border-bottom: none;
	}
	.cmp-head .btn {
		margin-bottom: 6px;
		min-height: 44px;
	}
	.slider {
		position: relative;
		aspect-ratio: 4 / 3;
		max-height: 70vh;
		background: var(--ink);
		overflow: hidden;
		user-select: none;
	}
	.slider img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.slider .over {
		clip-path: inset(0 0 0 var(--split));
	}
	.slider .handle {
		position: absolute;
		top: 0;
		bottom: 0;
		left: var(--split);
		width: 2px;
		margin-left: -1px;
		background: var(--accent);
		pointer-events: none;
	}
	.slider input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: ew-resize;
	}
	.tag-a,
	.tag-b {
		position: absolute;
		bottom: 8px;
		padding: 2px 6px;
		background: var(--ink);
		color: var(--bg);
		font-size: 12px;
		font-weight: 700;
		pointer-events: none;
	}
	.tag-a {
		left: 8px;
	}
	.tag-b {
		right: 8px;
	}
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 20px;
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.shot img {
		display: block;
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		background: var(--surface);
	}
	.when {
		font-size: 14px;
	}
	.changed {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
	}
	@media (max-width: 599px) {
		.cmp-head {
			flex-wrap: wrap;
		}
		.cmp-head .kicker {
			flex: 1 0 100%;
		}
		.entry,
		.gap {
			grid-template-columns: 112px minmax(0, 1fr);
			gap: 12px;
		}
		.thumb img {
			width: 112px;
			height: 112px;
		}
		.pair {
			grid-template-columns: minmax(0, 1fr);
		}
		.gap {
			grid-template-columns: minmax(0, 1fr);
			gap: 2px;
		}
	}
	@media (min-width: 1024px) {
		.page {
			padding: 24px 32px 48px;
		}
	}
</style>
