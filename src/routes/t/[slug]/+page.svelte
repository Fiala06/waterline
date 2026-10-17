<script lang="ts">
	// Public, read-only tank page, built for sharing a tank with people who can help
	// diagnose a problem: the keeper's question, what's out of range and what it was
	// before, every reading against water changes, dosing and tank changes on one time
	// axis, the full test log, the setup and routine, losses, and the care log by day.
	// One column on phones and desktop; wide tables scroll in their own box. Times and
	// notes show only when the owner turns on "Detail for people helping me".
	import { onMount } from 'svelte';
	import EventLanes from '$lib/components/EventLanes.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import PublicAnalytics from '$lib/components/PublicAnalytics.svelte';
	import PublicHead from '$lib/components/PublicHead.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';

	let { data } = $props();
	const v = $derived(data.view);
	const d = $derived(data.detail);
	const photo = (id: string, size: 'thumb' | 'full' = 'thumb') => `/p/${v.slug}/${id}${size === 'thumb' ? '?size=thumb' : ''}`;

	// scripts on: the care log's filters and "Copy summary" work in place
	let mounted = $state(false);
	onMount(() => (mounted = true));

	// The lightbox: a tapped photo opens here, with prev/next through the photos
	// beside it; without scripts the link opens the full-size image instead.
	type Shot = { id: string; date: string };
	let box = $state<HTMLDialogElement>();
	let shots = $state<Shot[]>([]);
	let shot = $state<number | null>(null);
	const current = $derived(shot == null ? null : (shots[shot] ?? null));
	function openShot(e: MouseEvent, list: Shot[], i: number) {
		if (!box?.showModal || !list.length || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
		e.preventDefault();
		shots = list;
		shot = i;
		box.showModal();
	}
	const step = (n: number) => {
		if (shot != null && shots.length) shot = (shot + n + shots.length) % shots.length;
	};
	// a tap on the dark stage around the photo closes it (the photo, the arrows and the bar don't)
	function onboxclick(e: MouseEvent) {
		const t = e.target as HTMLElement;
		if (t === box || t.classList.contains('lb') || t.classList.contains('lb-stage')) box?.close();
	}
	function onboxkey(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') step(1);
		else if (e.key === 'ArrowLeft') step(-1);
		else return;
		e.preventDefault();
	}
	const gridShots = $derived(v.photos.slice(0, 8));
	const coverShot = $derived(v.cover && v.coverDate ? [{ id: v.cover, date: v.coverDate }] : []);
	// The timeline, newest first: the latest few, the rest behind "Show earlier". A second photo on
	// the same day shares the readings shown with the one above it (`repeat`): once is enough.
	const TL_SHOW = 6;
	const tlAll = $derived([...v.timeline].reverse().map((e, i, all) => ({ ...e, repeat: i > 0 && all[i - 1].gap?.days === 0 })));
	const tlRecent = $derived(tlAll.slice(0, TL_SHOW));
	const tlEarlier = $derived(tlAll.slice(TL_SHOW));
	const timelineShots = $derived(tlAll.map((e) => ({ id: e.id, date: e.date })));

	// the visitor's range is a link, so it works without scripts
	const rangeHref = (key: string) => `/t/${v.slug}${key !== '30d' ? `?chart=${key}` : ''}#trends`;
	const rangeQuery = $derived(data.ranges.chart !== '30d' ? `?chart=${data.ranges.chart}` : '');
	const period = $derived(v.ranges.chart.title);

	const jsonLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'WebPage',
		name: data.seo.title,
		description: data.seo.description,
		url: data.seo.canonical,
		image: data.seo.image,
		...(v.keeper ? { author: { '@type': 'Person', name: v.keeper } } : {}),
		about: { '@type': 'Thing', name: `${v.name} (${v.type.toLowerCase()} aquarium)` }
	});
	const eyebrow = $derived(
		[v.type, v.volume ? `${v.volume}${d.waterVolume ? ` tank, ${d.waterVolume} water` : ''}` : null, d.size, d.dayNumber ? `Day ${d.dayNumber}` : null].filter(Boolean).join(' · ')
	);
	// "today, 7:12 PM" or "Sep 25, 12:22 PM"
	const testedWhen = $derived(v.tested ? `${v.tested}${v.testedTime ? `, ${v.testedTime}` : ''}` : null);
	const byLine = $derived(
		[v.keeper ? `Kept by ${v.keeper}` : null, v.since ? `Running since ${v.since}` : null].filter(Boolean).join(' · ')
	);

	// Copy summary: the page as text for a forum post; without scripts the link opens it
	let copied = $state(false);
	async function copySummary(e: MouseEvent) {
		if (!navigator.clipboard || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
		e.preventDefault();
		try {
			await navigator.clipboard.writeText(data.summary);
			copied = true;
			setTimeout(() => (copied = false), 2500);
		} catch {
			location.href = `/t/${v.slug}/summary.txt${rangeQuery}`;
		}
	}

	// the care log's filter, by kind
	const KINDS = [
		{ k: 'all', t: 'All' },
		{ k: 'test', t: 'Water tests' },
		{ k: 'water_change', t: 'Water changes' },
		{ k: 'dosing', t: 'Dosing' },
		{ k: 'maintenance', t: 'Maintenance' },
		{ k: 'observation', t: 'Observations' },
		{ k: 'livestock', t: 'Livestock & plants' },
		{ k: 'equipment', t: 'Equipment' },
		{ k: 'feeding', t: 'Feeding' }
	] as const;
	let kind = $state<string>('all');
	const kinds = $derived(KINDS.filter((k) => k.k === 'all' || d.careDays.some((day) => day.items.some((i) => i.category === k.k))));
	const CARE_SHOW = 10;
	let careAll = $state(false);
	const careDays = $derived(
		d.careDays.map((day) => ({ ...day, items: kind === 'all' ? day.items : day.items.filter((i) => i.category === kind) })).filter((day) => day.items.length)
	);
	const careShown = $derived(careAll ? careDays : careDays.slice(0, CARE_SHOW));

	const hasTrends = $derived(d.lanes.length > 0);
	const hasTests = $derived(d.testLog.rows.length > 0);
	const hasSetup = $derived(d.setup.length > 0 || d.gear.length > 0 || d.schedules.length > 0 || v.without.length > 0 || !!d.routine?.waterChanges || d.schedule.length > 0);
	const hasLife = $derived(d.animals.length > 0 || d.plants.length > 0 || d.losses.length > 0);
	const hasCare = $derived(d.careDays.length > 0);
	const nav = $derived(
		[
			{ id: 'summary', t: 'Summary', on: true },
			{ id: 'trends', t: 'Readings & events', on: hasTrends },
			{ id: 'tests', t: 'Test log', n: d.testLog.rows.length, on: hasTests },
			{ id: 'setup', t: 'Setup & routine', on: hasSetup },
			{ id: 'life', t: 'Livestock & plants', on: hasLife },
			{ id: 'care', t: 'Care log', on: hasCare },
			{ id: 'photos', t: 'Photos', on: v.photos.length > 0 || v.timeline.length > 0 }
		].filter((s) => s.on)
	);
	// a probe's latest reading (#19): "● Live · 9:30 AM" beside the parameter
	const liveOf = (id: string) => v.readings.find((r) => r.id === id)?.live ?? null;
	const hasSensor = $derived(d.lanes.some((l) => l.sensor.length > 1));
	const POSITION: Record<string, string> = { background: 'background', midground: 'midground', foreground: 'foreground', epiphyte: 'epiphyte', floating: 'floating' };
</script>

<PublicHead seo={data.seo} verification={data.verification} {jsonLd} />

<div class="pub">
	<header class="top">
		<div class="top-in">
			<a href="/" class="brand" aria-label="Waterline"><Logo size={24} wordmark wordSize={16} /></a>
			<span class="shared hide-phone">Shared, read-only</span>
			<span class="grow"></span>
			<a class="btn act" href="/t/{v.slug}/summary.txt{rangeQuery}" onclick={copySummary} aria-label="Copy summary for a forum post">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="8" y="8" width="13" height="13"></rect><path d="M16 8V3H3v13h5"></path></svg>
				<span class="hide-phone">{copied ? '✓ Copied' : 'Copy summary for a forum post'}</span>
			</a>
			{#if hasTests}
				<a class="btn act" href="/t/{v.slug}/data.csv{rangeQuery}" download aria-label="Download the tests (CSV)">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12M6 10l6 6 6-6M4 21h16"></path></svg>
					<span class="hide-phone">Download data (CSV)</span>
				</a>
			{/if}
			{#if data.ownerTankId}<a class="btn act" href="/tanks/{data.ownerTankId}/public">Edit</a>{/if}
		</div>
		{#if copied}<p class="sr-only" role="status">Summary copied</p>{/if}
	</header>

	<main class="wrap">
		<!-- ── Who and what ─────────────────────────────────────── -->
		<section class="intro">
			{#if v.cover}
				<!-- the cover opens full size in the lightbox, like any photo on the page -->
				<a class="hero" href={photo(v.cover, 'full')} onclick={(e) => openShot(e, coverShot, 0)}><img src={photo(v.cover, 'full')} alt="{v.name} aquarium" style:object-position={v.coverPos} /></a>
			{:else}
				<div class="hero photo-placeholder"></div>
			{/if}
			<div class="title">
				<p class="eyebrow">{eyebrow}</p>
				<h1>{v.name}</h1>
				{#if byLine || testedWhen}
					<p class="by">{byLine}{#if byLine && testedWhen}{' · '}{/if}{#if testedWhen}Last water test <b>{testedWhen}</b>{/if}</p>
				{/if}
				<p class="units">{d.units}</p>
			</div>
		</section>

		{#if nav.length > 2}
			<nav class="secnav" aria-label="Sections">
				{#each nav as s (s.id)}<a href="#{s.id}">{s.t}{#if s.n}<span class="n">{s.n}</span>{/if}</a>{/each}
			</nav>
		{/if}

		<!-- ── Summary: the keeper's question, then what needs attention ── -->
		<section id="summary" class="summary">
			{#if d.question || v.description}
				<div class="ask">
					{#if d.question}
						<h2>What I'm asking about</h2>
						<blockquote class="question">{d.question}</blockquote>
					{/if}
					{#if v.description}
						{#if d.question}<h3>About this tank</h3>{:else}<h2>About this tank</h2>{/if}
						<p class="desc">{v.description}</p>
					{/if}
				</div>
			{/if}

			{#if d.attention.length || d.steady.length}
				<div class="att">
					<div class="sh">
						<h2>{d.attention.length ? 'Needs attention' : 'Latest readings'}</h2>
						{#if testedWhen}<span class="muted">from the test {v.tested === 'today' ? 'today' : 'on ' + v.tested}{v.testedTime ? `, ${v.testedTime}` : ''}</span>{/if}
					</div>
					{#each d.attention as a (a.id)}
						<div class="arow">
							<div class="aname">
								<span class="an">{a.longName} <span class="status-{a.level} as">{a.status}</span></span>
								<span class="ameta">{[a.target ? `Target ${a.target}` : null, a.prev ? `was ${a.prev.value} on ${a.prev.day}` : null, a.outOf].filter(Boolean).join(' · ')}</span>
								{#if liveOf(a.id)}{@const lv = liveOf(a.id)!}<span class="rl" class:fresh={lv.fresh}>{lv.fresh ? '●' : '○'} {lv.text}</span>{/if}
							</div>
							<div class="aspark"><Sparkline values={a.spark} level={a.level} lo={a.band.min} hi={a.band.max} /></div>
							<div class="aval num"><b class:bad={a.level === 'bad'}>{a.value}</b>{#if a.unit}{' '}<small>{a.unit}</small>{/if}</div>
						</div>
					{/each}
					{#if d.steady.length}
						<ul class="steady">
							{#each d.steady as s (s.id)}
								<li>
									<span class="sn">{s.name} <span class="status-{s.level}">{s.status.split(' ')[0]}</span></span>
									<span class="sv num">{s.value}{#if s.unit}{' '}<small>{s.unit}</small>{/if}</span>
									<span class="st">{s.target || 'no target'}</span>
									{#if liveOf(s.id)}{@const lv = liveOf(s.id)!}<span class="rl" class:fresh={lv.fresh}>{lv.fresh ? '●' : '○'} {lv.text}</span>{/if}
								</li>
							{/each}
						</ul>
					{/if}
					{#each d.warnings as w (w)}<p class="worth"><b>Worth checking:</b> {w}</p>{/each}
				</div>
			{/if}
		</section>

		<!-- ── Readings & events ────────────────────────────────── -->
		{#if hasTrends}
			<section id="trends">
				<div class="sh big">
					<div>
						<h2>Readings &amp; events</h2>
						<p class="lede">Every test, water change, dose and change to the tank on one timeline.</p>
					</div>
					<nav class="seg" aria-label="Time range">
						{#each data.chartRanges as r (r.key)}
							<a href={rangeHref(r.key)} aria-current={data.ranges.chart === r.key ? 'true' : undefined}>{r.label}</a>
						{/each}
					</nav>
				</div>
				<div class="lanes-box">
					<EventLanes lanes={d.lanes} markers={d.markers} axis={d.axis} />
				</div>
				<p class="legend">
					<span><i class="sw band" aria-hidden="true"></i>Target range</span>
					<span><i class="sw dot bad" aria-hidden="true"></i>Out of range</span>
					<span><i class="sw sq" aria-hidden="true"></i>Water change (dashed line through every lane)</span>
					<span><i class="sw dia" aria-hidden="true"></i>Dose</span>
					{#if hasSensor}<span><i class="sw sensor" aria-hidden="true"></i>Sensor</span>{/if}
					<span><i class="sw dot lossc" aria-hidden="true"></i>Livestock loss</span>
				</p>
				{#if d.markers.changes.length}
					<ol class="keylist">
						{#each d.markers.changes as c (c.n)}
							<li class:loss={c.loss}><b class="kn">{c.n}</b><span><b>{c.day}</b> · {c.text}</span></li>
						{/each}
					</ol>
				{/if}
			</section>
		{/if}

		<!-- ── Test log ─────────────────────────────────────────── -->
		{#if hasTests}
			<section id="tests">
				<div class="sh big">
					<div>
						<h2>Water test log</h2>
						<p class="lede">Every reading as entered, newest first. Out-of-range values are shaded; a heavy rule marks a water change between two tests.</p>
					</div>
					<span class="muted">{d.testLog.rows.length} {d.testLog.rows.length === 1 ? 'test' : 'tests'} · {period}</span>
				</div>
				<!-- a scrolling box is focusable, so the keyboard can scroll it (axe: scrollable-region-focusable) -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div class="tbox" role="region" aria-label="Water test log" tabindex="0">
					<table class="log">
						<thead>
							<tr>
								<th scope="col" class="l">{d.details ? 'Date & time' : 'Date'}</th>
								{#each d.testLog.columns as c (c.id)}<th scope="col">{c.name}{#if c.unit}<span class="u">{c.unit}</span>{/if}</th>{/each}
								{#if d.details}<th scope="col" class="l">Note</th>{/if}
							</tr>
						</thead>
						<tbody>
							{#each d.testLog.rows as r (r.id)}
								<tr class:wc={r.changeBefore}>
									<th scope="row" class="l when">{r.when}</th>
									{#each r.cells as c, i (i)}
										{#if c}
											<td class={c.level} title={c.status}>{c.v}{#if c.level === 'bad'}<span class="sr-only"> {c.status}</span>{/if}</td>
										{:else}
											<td class="na"><span aria-hidden="true">–</span><span class="sr-only">not tested</span></td>
										{/if}
									{/each}
									{#if d.details}<td class="l note">{r.note ?? ''}</td>{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}

		<!-- ── Setup & routine ──────────────────────────────────── -->
		{#if hasSetup}
			<section id="setup" class="two">
				{#if d.setup.length || d.gear.length || d.schedules.length || v.without.length}
					<div class="col">
						<div class="sh big"><h2>Setup</h2></div>
						{#if d.setup.length}
							<dl class="facts">
								{#each d.setup as [k, val] (k)}<dt>{k}</dt><dd>{val}</dd>{/each}
							</dl>
						{/if}
						{#if d.schedules.length}
							<div class="block">
								<h3>Daily schedule</h3>
								{#each d.schedules as s (s.name)}
									<div class="sched">
										<span class="sname">{s.name}</span>
										<div class="day" role="img" aria-label="{s.name} {s.bars.map((b) => b.label).filter(Boolean).join(', ')}">
											{#each s.bars as b, i (i)}<i class:co2={s.name !== 'Light'} style:left="{b.from * 100}%" style:width="{(b.to - b.from) * 100}%"></i>{/each}
										</div>
										<span class="stext">{s.bars.map((b) => b.label).filter(Boolean).join(', ')}{s.text ? ` · ${s.text}` : ''}</span>
									</div>
								{/each}
								<div class="hours" aria-hidden="true"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
							</div>
						{/if}
						{#if d.gear.length || v.without.length}
							<div class="block">
								<h3>Equipment</h3>
								<ul class="rows">
									{#each d.gear as g (g.id)}
										<li><span class="gt">{g.type}</span><span><b>{g.name}</b>{#if g.spec}<span class="muted">{` · ${g.spec}`}</span>{/if}</span><span class:fresh={g.fresh} class="gs">{g.since ? (g.fresh ? `New ${g.since}` : `since ${g.since}`) : ''}</span></li>
									{/each}
									{#each v.without as w (w)}<li><span class="gt">{w}</span><span class="muted">None, on purpose</span><span></span></li>{/each}
								</ul>
							</div>
						{/if}
					</div>
				{/if}
				{#if d.routine?.waterChanges || d.routine?.dosing.length || d.schedule.length}
					<div class="col">
						<div class="sh big"><h2>Routine</h2><span class="muted">{period}</span></div>
						{#if d.routine}
							<div class="stats">
								<div><b class="num">{d.routine.waterChanges}</b><span>water {d.routine.waterChanges === 1 ? 'change' : 'changes'}</span></div>
								{#if d.routine.avgPct}<div><b class="num">{d.routine.avgPct}</b><span>average change</span></div>{/if}
								{#if d.routine.avgGap}<div><b class="num">{d.routine.avgGap}</b><span>average gap</span></div>{/if}
							</div>
							{#if d.routine.sources}<p class="muted small">Water: {d.routine.sources}</p>{/if}
							{#if d.routine.dosing.length}
								<div class="block">
									<h3>Dosing</h3>
									<div class="tbox">
										<table class="log">
											<thead><tr><th scope="col" class="l">Product</th><th scope="col">Doses</th><th scope="col">Typical</th><th scope="col">Last</th></tr></thead>
											<tbody>
												{#each d.routine.dosing as p (p.product)}<tr><th scope="row" class="l when">{p.product}</th><td>{p.count}</td><td>{p.typical ?? '–'}</td><td>{p.last}</td></tr>{/each}
											</tbody>
										</table>
									</div>
								</div>
							{/if}
							{#if d.routine.feeding === false}<p class="muted small">Feeding not logged in this period.</p>{/if}
						{/if}
						{#if d.schedule.length}
							<div class="block">
								<h3>Schedule</h3>
								<ul class="rows">
									{#each d.schedule as t (t.name)}<li class="two-col"><span>{t.name} · {t.every}</span><span class:overdue={t.overdue}>{t.due}</span></li>{/each}
								</ul>
							</div>
						{/if}
					</div>
				{/if}
			</section>
		{/if}

		<!-- ── Livestock & plants ───────────────────────────────── -->
		{#if hasLife}
			<section id="life">
				<div class="sh big"><h2>Livestock &amp; plants</h2></div>
				<div class="two">
					<div class="col">
						{#if d.animals.length}
							<div class="tbox">
								<table class="log">
									<thead><tr><th scope="col" class="l">Animal</th><th scope="col">Count</th><th scope="col">Added</th></tr></thead>
									<tbody>
										{#each d.animals as a (a.id)}
											<tr><th scope="row" class="l when">{a.name}{#if a.scientific}<span class="sci">{` ${a.scientific}`}</span>{/if}</th><td>{a.count}</td><td>{a.since ?? '–'}</td></tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
						{#if d.losses.length}
							<div class="losses">
								<h3>Losses · {d.lostCount} in {period}</h3>
								<ul>
									{#each d.losses as l, i (i)}<li><b>{l.day}</b> · {l.text}{#if l.note}{' · '}<span class="muted">{l.note}</span>{/if}</li>{/each}
								</ul>
							</div>
						{/if}
						{#each d.care as c (c.name)}<p class="muted small"><b>{c.name}:</b> {c.line}</p>{/each}
					</div>
					{#if d.plants.length}
						<div class="col">
							<p class="muted small">{d.plants.length} {d.plants.length === 1 ? 'plant' : 'plants'}</p>
							<ul class="plants">
								{#each d.plants as p (p.id)}<li><b>{p.name}</b> · {POSITION[p.position] ?? p.position}</li>{/each}
							</ul>
						</div>
					{/if}
				</div>
			</section>
		{/if}

		<!-- ── Care log ─────────────────────────────────────────── -->
		{#if hasCare}
			<section id="care">
				<div class="sh big">
					<h2>Care log</h2>
					{#if mounted && kinds.length > 2}
						<div class="filters" role="group" aria-label="Show in the care log">
							{#each kinds as k (k.k)}<button type="button" class="chip" aria-pressed={kind === k.k} onclick={() => ((kind = k.k), (careAll = false))}>{k.t}</button>{/each}
						</div>
					{/if}
				</div>
				{#each careShown as day (day.day)}
					<div class="cday">
						<div class="cd"><b>{day.day}</b><span class="muted">{day.dow}</span></div>
						<ul class="citems">
							{#each day.items as it, i (i)}
								<li class:timed={d.details}>
									{#if d.details}<span class="ct num">{it.time}</span>{/if}
									<span class="ck">{it.kind}</span>
									<span class="cx"><span class:bad={it.bad || it.loss}>{it.title}</span>{#if it.note}<span class="cn">{` · ${it.note}`}</span>{/if}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
				{#if careDays.length > CARE_SHOW && !careAll}
					<button type="button" class="more-btn" onclick={() => (careAll = true)}>Show {careDays.length - CARE_SHOW} earlier days</button>
				{/if}
			</section>
		{/if}

		<!-- ── Photos and the timeline ──────────────────────────── -->
		{#if v.photos.length || v.timeline.length}
			<section id="photos">
				<div class="sh big"><h2>Photos</h2></div>
				{#if v.photos.length}
					<div class="grid">
						{#each gridShots as p, i (p.id)}
							<a href={photo(p.id, 'full')} onclick={(e) => openShot(e, gridShots, i)}><img src={photo(p.id)} alt="{v.name} on {p.date}" loading="lazy" /><span class="cap">{p.date}</span></a>
						{/each}
					</div>
				{/if}
				{#if v.timeline.length}
					<h3>Timeline</h3>
					<!-- compact rows: a small shot, the date and the day's facts on one line, the readings under it -->
					{#snippet gapRow(gap: NonNullable<(typeof tlAll)[number]['gap']>)}
						<!-- what happened between a photo and the older one below it -->
						<li class="tl-gap"><b>{gap.label}</b>{gap.summary ? ` · ${gap.summary}` : ''}</li>
					{/snippet}
					{#snippet entries(list: typeof tlAll, offset: number)}
						{#each list as e, i (e.id)}
							<li class="tl-entry">
								<a class="tl-shot" href={photo(e.id, 'full')} onclick={(ev) => openShot(ev, timelineShots, offset + i)}><img src={photo(e.id)} alt="{v.name} on {e.date}" loading="lazy" /></a>
								<div class="tl-info">
									<span class="tl-line">
										<span class="tl-date">{e.date}</span>
										{#if e.dayNumber || e.animals || e.plants}
											<span class="muted tl-stats">
												{' · ' +
													[e.dayNumber ? `Day ${e.dayNumber}` : null, e.animals ? `${e.animals} animal${e.animals === 1 ? '' : 's'}` : null, e.plants ? `${e.plants} plant${e.plants === 1 ? '' : 's'}` : null]
														.filter(Boolean)
														.join(' · ')}
											</span>
										{/if}
									</span>
									{#if e.readings?.length && !e.repeat}
										<ul class="tl-readings">
											{#each e.readings as r (r.name)}
												<li><span class="muted">{r.name}</span> <span class="num">{r.value}{r.unit ? ` ${r.unit}` : ''}</span> <span class="rs status-{r.level}">{r.status}</span></li>
											{/each}
										</ul>
									{/if}
								</div>
							</li>
							{#if e.gap && i < list.length - 1}{@render gapRow(e.gap)}{/if}
						{/each}
					{/snippet}
					<ol class="tl">
						{@render entries(tlRecent, 0)}
						{#if tlEarlier.length}
							{@const lastGap = tlRecent.at(-1)?.gap}
							<li class="more">
								<details>
									<summary>Show {tlEarlier.length} earlier<span class="chev" aria-hidden="true">▾</span></summary>
									<ol class="tl">
										{#if lastGap}{@render gapRow(lastGap)}{/if}
										{@render entries(tlEarlier, tlRecent.length)}
									</ol>
								</details>
							</li>
						{/if}
					</ol>
				{/if}
			</section>
		{/if}

		<footer class="foot">
			<span class="fl"><Logo size={18} />Shared from Waterline · read-only</span>
			{#if d.care.length}<span>Species care ranges from FishBase, CC BY-NC 4.0</span>{/if}
		</footer>
	</main>
</div>

<!-- The lightbox: the photo on a dark stage, its date, prev/next, Esc or a tap outside to close -->
<dialog class="lightbox" bind:this={box} aria-label="Photo" onclose={() => (shot = null)} onclick={onboxclick} onkeydown={onboxkey}>
	{#if current}
		<div class="lb">
			<div class="lb-stage"><img src={photo(current.id, 'full')} alt="{v.name} on {current.date}" /></div>
			{#if shots.length > 1}
				<button type="button" class="lb-nav lb-prev" onclick={() => step(-1)} aria-label="Previous photo">‹</button>
				<button type="button" class="lb-nav lb-next" onclick={() => step(1)} aria-label="Next photo">›</button>
			{/if}
			<div class="lb-bar">
				<span class="lb-cap">{current.date}{shots.length > 1 ? ` · ${(shot ?? 0) + 1} of ${shots.length}` : ''}</span>
				<a class="lb-full" href={photo(current.id, 'full')} target="_blank" rel="noopener">Full size ↗</a>
				<button type="button" class="lb-close" onclick={() => box?.close()} aria-label="Close">✕</button>
			</div>
		</div>
	{/if}
</dialog>

<PublicAnalytics ga4Id={data.analytics.ga4Id} consent={data.analytics.consent} />

<style>
	.pub {
		min-height: 100dvh;
		background: var(--bg);
		color: var(--text);
	}

	/* ── Header ───────────────────────────────────────────────── */
	.top {
		border-bottom: 1px solid var(--divider);
		padding-top: env(safe-area-inset-top);
	}
	.top-in {
		max-width: 1200px;
		margin: 0 auto;
		min-height: 60px;
		padding: 8px 20px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--text);
	}
	.shared {
		font-size: 13px;
		color: var(--text-muted);
		border: 1px solid var(--divider);
		padding: 3px 10px;
	}
	.grow {
		flex: 1 1 auto;
	}
	.act {
		min-height: 44px;
		min-width: 44px;
		padding: 0 14px;
		font-size: 14px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}

	/* ── Layout ───────────────────────────────────────────────── */
	.wrap {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 20px 64px;
		display: flex;
		flex-direction: column;
		gap: 40px;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
		scroll-margin-top: 16px;
	}
	/* a heading over a 2px ink rule, its meta on the right */
	.sh {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-end;
		gap: 8px 16px;
		padding-bottom: 10px;
		border-bottom: 2px solid var(--ink);
	}
	.sh .muted {
		font-size: 13px;
	}
	h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
	}
	.sh.big h2 {
		font-size: 24px;
		font-weight: 800;
	}
	h3 {
		margin: 0;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.lede {
		margin: 4px 0 0;
		font-size: 14px;
		color: var(--text-2);
		max-width: 720px;
	}
	.muted {
		color: var(--text-muted);
	}
	.small {
		margin: 0;
		font-size: 13px;
	}
	.two {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
		gap: 40px;
		align-items: start;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-width: 0;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	/* ── Cover + title ────────────────────────────────────────── */
	.intro {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding-top: 0;
	}
	.hero {
		display: block;
		height: 220px;
		margin: 0 -20px;
		overflow: hidden;
	}
	.hero img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.title {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.eyebrow {
		margin: 0;
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	h1 {
		margin: 0;
		font-size: 40px;
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1;
		overflow-wrap: anywhere;
	}
	.by {
		margin: 0;
		font-size: 15px;
		color: var(--text-2);
	}
	.by b {
		color: var(--text);
	}
	.units {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	@media (min-width: 720px) {
		.intro {
			flex-direction: row;
			align-items: flex-end;
			gap: 32px;
			padding-top: 40px;
		}
		.hero {
			flex: 0 0 240px;
			height: 180px;
			margin: 0;
		}
		h1 {
			font-size: 60px;
		}
	}

	/* ── Section nav ──────────────────────────────────────────── */
	.secnav {
		display: flex;
		gap: 4px 22px;
		overflow-x: auto;
		margin-top: -16px;
		padding: 10px 0;
		border-top: 2px solid var(--ink);
		border-bottom: 1px solid var(--divider);
		font-size: 15px;
		font-weight: 600;
		white-space: nowrap;
	}
	.secnav a {
		color: var(--text);
		text-decoration: none;
		min-height: 32px;
		display: inline-flex;
		align-items: center;
	}
	.secnav a:hover {
		color: var(--accent-text);
	}
	.secnav .n {
		margin-left: 5px;
		font-weight: 400;
		color: var(--text-muted);
	}

	/* ── Summary ──────────────────────────────────────────────── */
	.summary {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
		gap: 40px;
		align-items: start;
	}
	.ask {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.question {
		margin: 0;
		padding: 18px 20px;
		background: var(--surface);
		font-size: 18px;
		line-height: 1.45;
		white-space: pre-line;
	}
	.desc {
		margin: 0;
		font-size: 15px;
		line-height: 1.6;
		white-space: pre-line;
	}
	.att {
		display: flex;
		flex-direction: column;
	}
	.arow {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 96px auto;
		gap: 12px;
		align-items: center;
		padding: 12px 0;
		border-bottom: 1px solid var(--divider);
	}
	.aname {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.an {
		font-size: 17px;
		font-weight: 700;
	}
	.as {
		font-size: 13px;
		font-weight: 700;
		white-space: nowrap;
	}
	.ameta {
		font-size: 13px;
		color: var(--text-muted);
	}
	.aspark {
		height: 32px;
	}
	.aspark :global(.spark) {
		min-height: 32px;
	}
	.aval {
		text-align: right;
		white-space: nowrap;
	}
	.aval b {
		font-size: 28px;
		font-weight: 800;
	}
	.aval b.bad {
		color: var(--bad-text);
	}
	.aval small {
		font-size: 12px;
		color: var(--text-muted);
	}
	.steady {
		list-style: none;
		margin: 0;
		padding: 14px 0 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: 12px;
	}
	.steady li {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.sn {
		font-size: 12px;
		color: var(--text-muted);
	}
	.sv {
		font-size: 20px;
		font-weight: 700;
	}
	.sv small {
		font-size: 11px;
		font-weight: 400;
		color: var(--text-muted);
	}
	.st {
		font-size: 11px;
		color: var(--text-muted);
	}
	.rl {
		font-size: 11px;
		color: var(--text-muted);
	}
	.rl.fresh {
		color: var(--text);
		font-weight: 600;
	}
	.sw.sensor {
		height: 2px;
		background: var(--neutral-500);
	}
	.worth {
		margin: 14px 0 0;
		padding: 10px 12px;
		background: var(--surface);
		font-size: 13px;
		color: var(--text-2);
	}
	@media (max-width: 479px) {
		.arow {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.aspark {
			display: none;
		}
	}

	/* ── Readings & events ───────────────────────────────────── */
	.seg {
		display: flex;
	}
	.seg a {
		min-height: 40px;
		padding: 0 14px;
		display: inline-flex;
		align-items: center;
		font-size: 14px;
		color: var(--text);
		text-decoration: none;
		border: 1px solid var(--border-strong);
		margin-left: -1px;
	}
	.seg a[aria-current='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
		font-weight: 600;
		position: relative;
	}
	.lanes-box {
		min-width: 0;
	}
	.legend {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px 20px;
		font-size: 13px;
		color: var(--text-2);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.sw {
		display: inline-block;
		width: 14px;
		height: 10px;
	}
	.sw.band {
		background: var(--band);
	}
	.sw.dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
	}
	.sw.dot.bad {
		background: var(--bad);
	}
	.sw.dot.lossc {
		background: var(--accent);
		width: 11px;
		height: 11px;
	}
	.sw.sq {
		width: 8px;
		height: 8px;
		background: var(--ink);
	}
	.sw.dia {
		width: 8px;
		height: 8px;
		border: 1.5px solid var(--ink);
		transform: rotate(45deg);
	}
	.keylist {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
		gap: 0 32px;
		font-size: 14px;
		border-top: 1px solid var(--divider);
	}
	.keylist li {
		display: flex;
		gap: 12px;
		padding: 9px 0;
		border-bottom: 1px solid var(--divider-soft);
	}
	.kn {
		flex: 0 0 22px;
	}
	.keylist li.loss .kn {
		color: var(--bad-text);
	}

	/* ── Tables: the test log, dosing, livestock ─────────────── */
	.tbox {
		/* holds the screen-reader words in its cells, so they scroll with it instead of widening the page */
		position: relative;
		overflow-x: auto;
		max-width: 100%;
	}
	#tests .tbox {
		max-height: 640px;
		overflow-y: auto;
	}
	.log {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
		font-variant-numeric: tabular-nums;
	}
	.log th,
	.log td {
		padding: 9px 10px;
		text-align: right;
		white-space: nowrap;
		border-bottom: 1px solid var(--divider-soft);
	}
	.log thead th {
		position: sticky;
		top: 0;
		background: var(--bg);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
		border-bottom: 2px solid var(--ink);
		vertical-align: bottom;
	}
	.log thead .u {
		display: block;
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
	}
	.log .l {
		text-align: left;
	}
	.log .when {
		font-weight: 600;
	}
	/* on a phone the dates stay in view while the readings scroll under them */
	.log tbody th.when {
		position: sticky;
		left: 0;
		background: var(--bg);
	}
	.log .note {
		white-space: normal;
		min-width: 240px;
		color: var(--text-2);
	}
	.log td.bad {
		background: var(--bad-bg);
		color: var(--bad-text);
		font-weight: 700;
	}
	.log td.warn {
		font-weight: 700;
	}
	.log td.warn::before {
		content: '▲ ';
		font-size: 9px;
	}
	.log td.na {
		color: var(--placeholder);
	}
	.log tr.wc > * {
		border-bottom: 2px solid var(--ink);
	}
	.sci {
		font-weight: 400;
		font-style: italic;
		color: var(--text-muted);
	}

	/* ── Setup & routine ──────────────────────────────────────── */
	.facts {
		margin: 0;
		display: grid;
		grid-template-columns: minmax(96px, 140px) minmax(0, 1fr);
		gap: 10px 16px;
		font-size: 15px;
	}
	.facts dt {
		color: var(--text-muted);
	}
	.facts dd {
		margin: 0;
	}
	.sched {
		display: grid;
		grid-template-columns: 52px minmax(0, 1fr);
		gap: 4px 12px;
		align-items: center;
	}
	.sname {
		font-size: 13px;
		font-weight: 700;
	}
	.day {
		position: relative;
		height: 16px;
		background: var(--surface);
	}
	.day i {
		position: absolute;
		top: 0;
		bottom: 0;
		background: var(--ink);
	}
	.day i.co2 {
		background: var(--accent);
	}
	.stext {
		grid-column: 2;
		font-size: 12px;
		color: var(--text-2);
	}
	.hours {
		margin-left: 64px;
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		color: var(--text-muted);
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 14px;
	}
	.rows li {
		display: grid;
		grid-template-columns: 84px minmax(0, 1fr) auto;
		gap: 12px;
		padding: 9px 0;
		border-bottom: 1px solid var(--divider-soft);
	}
	.rows li.two-col {
		grid-template-columns: minmax(0, 1fr) auto;
	}
	.gt,
	.gs {
		color: var(--text-muted);
		font-size: 13px;
	}
	.gs.fresh,
	.overdue {
		color: var(--bad-text);
		font-weight: 600;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}
	.stats div {
		background: var(--surface);
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
	}
	.stats b {
		font-size: 28px;
		font-weight: 800;
	}
	.stats span {
		font-size: 12px;
		color: var(--text-2);
	}

	/* ── Livestock & plants ───────────────────────────────────── */
	.losses {
		background: var(--bad-bg);
		border: 1px solid var(--bad-border);
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.losses h3 {
		color: var(--bad-text);
		text-transform: none;
		letter-spacing: 0;
		font-size: 15px;
	}
	.losses ul {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 14px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.plants {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0 24px;
		font-size: 14px;
	}
	.plants li {
		padding: 8px 0;
		border-bottom: 1px solid var(--divider-soft);
	}

	/* ── Care log ─────────────────────────────────────────────── */
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.cday {
		display: grid;
		grid-template-columns: 120px minmax(0, 1fr);
		gap: 12px 16px;
		padding: 12px 0;
		border-bottom: 1px solid var(--divider);
	}
	.cd {
		display: flex;
		flex-direction: column;
		font-size: 15px;
	}
	.cd .muted {
		font-size: 12px;
	}
	.citems {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 14px;
	}
	.citems li {
		display: grid;
		grid-template-columns: 130px minmax(0, 1fr);
		gap: 12px;
		align-items: baseline;
	}
	.citems li.timed {
		grid-template-columns: 70px 130px minmax(0, 1fr);
	}
	.ct {
		color: var(--text-muted);
		font-size: 13px;
	}
	.ck {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.cx .bad {
		color: var(--bad-text);
		font-weight: 600;
	}
	.cn {
		color: var(--text-2);
	}
	.more-btn {
		align-self: flex-start;
		min-height: 44px;
		padding: 0;
		background: none;
		border: none;
		font: inherit;
		font-size: 15px;
		font-weight: 700;
		color: var(--accent-text);
		cursor: pointer;
	}
	@media (max-width: 719px) {
		.cday {
			grid-template-columns: minmax(0, 1fr);
			gap: 6px;
		}
		.cd {
			flex-direction: row;
			gap: 8px;
			align-items: baseline;
		}
		.citems li,
		.citems li.timed {
			grid-template-columns: minmax(0, 1fr);
			gap: 0;
		}
		.citems li.timed {
			grid-template-columns: 64px minmax(0, 1fr);
		}
		.citems li .ck {
			display: none;
		}
		.rows li {
			grid-template-columns: 72px minmax(0, 1fr);
		}
		.rows li .gs {
			grid-column: 2;
		}
		.stats b {
			font-size: 22px;
		}
	}

	/* ── Photos ───────────────────────────────────────────────── */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
		gap: 14px;
	}
	.grid a {
		display: flex;
		flex-direction: column;
		gap: 4px;
		color: var(--text);
		text-decoration: none;
	}
	.grid img {
		display: block;
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		background: var(--surface);
	}
	.cap {
		font-size: 13px;
		font-weight: 600;
	}

	/* ── Timeline (#26) ─────────────────────────────────────── */
	.tl {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tl-entry {
		display: grid;
		grid-template-columns: 56px minmax(0, 1fr);
		gap: 10px;
		align-items: start;
		padding: 6px 0;
		border-bottom: 1px solid var(--divider);
	}
	.tl-shot {
		display: block;
		width: 56px;
		height: 56px;
	}
	.tl-shot img {
		display: block;
		width: 56px;
		height: 56px;
		object-fit: cover;
		background: var(--surface);
	}
	.tl-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		padding-top: 2px;
	}
	.tl-line {
		font-size: 14px;
		line-height: 1.3;
	}
	.tl-date {
		font-weight: 800;
	}
	.tl-stats {
		font-size: 13px;
	}
	.tl-readings {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0 12px;
		font-size: 12px;
		line-height: 1.5;
	}
	.tl-readings .num {
		font-weight: 700;
	}
	.tl-readings .rs {
		font-size: 11px;
		font-weight: 700;
	}
	.tl-gap {
		padding: 3px 0 3px 10px;
		border-left: 2px solid var(--ink);
		margin: 4px 0;
		font-size: 12px;
		line-height: 1.4;
		color: var(--text-2);
	}
	/* the earlier entries, and the rest of the log, fold away behind one row */
	.more summary {
		display: flex;
		align-items: center;
		min-height: 44px;
		cursor: pointer;
		list-style: none;
		font-size: 14px;
		font-weight: 700;
		border-bottom: 1px solid var(--divider);
	}
	.more summary::-webkit-details-marker {
		display: none;
	}
	.more details[open] > summary {
		margin-bottom: 4px;
	}
	.more details[open] .chev {
		transform: rotate(180deg);
	}


	/* ── Lightbox ─────────────────────────────────────────────── */
	.lightbox {
		width: 100vw;
		max-width: 100vw;
		height: 100dvh;
		max-height: 100dvh;
		margin: 0;
		padding: 0;
		border: none;
		background: var(--viewer-bg);
		color: var(--overlay-text);
	}
	.lightbox::backdrop {
		background: rgba(0, 0, 0, 0.6);
	}
	.lb {
		position: relative;
		height: 100%;
		display: flex;
		flex-direction: column;
	}
	.lb-stage {
		flex: 1 1 0;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: calc(12px + env(safe-area-inset-top)) 12px 12px;
	}
	.lb-stage img {
		display: block;
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		object-fit: contain;
	}
	.lb-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 44px;
		height: 44px;
		border: 1px solid var(--divider);
		border-radius: 0;
		background: var(--surface);
		color: var(--text-2);
		font-size: 22px;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.lb-prev {
		left: 12px;
	}
	.lb-next {
		right: 12px;
	}
	.lb-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 0 12px calc(env(safe-area-inset-bottom));
		background: var(--surface);
		color: var(--text);
		border-top: 2px solid var(--ink);
	}
	.lb-cap {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.lb-full {
		font-size: 13px;
		font-weight: 700;
		color: var(--text);
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.lb-close {
		width: 44px;
		height: 44px;
		border: 1px solid var(--divider);
		border-radius: 0;
		background: var(--bg);
		color: var(--text);
		font-size: 16px;
		cursor: pointer;
	}
	@media (hover: hover) {
		.lb-nav:hover,
		.lb-close:hover {
			background: var(--surface-hi);
			color: var(--text);
		}
	}


	/* ── Footer ───────────────────────────────────────────────── */
	.foot {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 12px;
		padding-top: 16px;
		border-top: 1px solid var(--divider);
		font-size: 13px;
		color: var(--text-muted);
	}
	.fl {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
</style>
