<script lang="ts">
	// Public, read-only tank page, built for sharing a tank with people who can help
	// diagnose a problem: the keeper's question, what's out of range and what it was
	// before, every reading against water changes, dosing and tank changes on one time
	// axis, the full test log, the setup and routine, losses, and the care log by day.
	// It opens as a showcase (the cover and recent photos, the latest readings as tiles,
	// livestock and plants with their photos); the long parts (test log, care log, the
	// tank's details and schedule) show their latest few and fold the rest. "Detail for
	// people helping me" opens them all, adds times and notes, and puts the diagnosis
	// (charts, test log, care log) ahead of the livestock and photos. Folds are <details>
	// or a checkbox, so they work without scripts.
	import { onMount } from 'svelte';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import EventLanes from '$lib/components/EventLanes.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import PublicAnalytics from '$lib/components/PublicAnalytics.svelte';
	import PublicHead from '$lib/components/PublicHead.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';

	let { data } = $props();
	const v = $derived(data.view);
	const d = $derived(data.detail);
	const photo = (id: string, size: 'thumb' | 'medium' | 'full' = 'thumb') => `/p/${v.slug}/${id}${size === 'full' ? '' : `?size=${size}`}`;

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
	const rangeHref = (key: string) => `${data.base}${key !== '30d' ? `?chart=${key}` : ''}#trends`;
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
	// the latest few days show; the rest fold (open with detail on)
	const CARE_SHOW = 3;
	const careDays = $derived(
		d.careDays.map((day) => ({ ...day, items: kind === 'all' ? day.items : day.items.filter((i) => i.category === kind) })).filter((day) => day.items.length)
	);
	// the test log's newest few, the rest behind "Show all"
	const TESTS_SHOW = 3;
	// the readings as tiles: what needs attention first
	const tiles = $derived([...d.attention, ...d.steady]);
	// the hero's strip: the newest photos besides the cover, from the timeline and the grid
	const stripAll = $derived.by(() => {
		const seen = new Set<string>(v.cover ? [v.cover] : []);
		const out: Shot[] = [];
		for (const p of [...tlAll.map((e) => ({ id: e.id, date: e.date })), ...v.photos]) {
			if (seen.has(p.id)) continue;
			seen.add(p.id);
			out.push(p);
		}
		return out;
	});
	const strip = $derived(stripAll.slice(0, 4));
	// the tank's details, dosing and schedule fold under what's always shown (equipment, the routine)
	const setupTop = $derived(d.gear.length > 0 || v.without.length > 0 || d.schedules.length > 0 || !!d.routine?.waterChanges);
	const setupMore = $derived(d.setup.length > 0 || !!d.routine?.dosing.length || d.routine?.feeding === false || d.schedule.length > 0);

	const hasTrends = $derived(d.lanes.length > 0);
	const hasTests = $derived(d.testLog.rows.length > 0);
	const hasSetup = $derived(d.setup.length > 0 || d.gear.length > 0 || d.schedules.length > 0 || v.without.length > 0 || !!d.routine?.waterChanges || !!d.routine?.dosing.length || d.schedule.length > 0);
	const hasLife = $derived(d.animals.length > 0 || d.plants.length > 0 || d.losses.length > 0);
	const hasCare = $derived(d.careDays.length > 0);
	// a visitor sees the tank first; someone helping sees the diagnosis first
	const ORDER = $derived(d.details ? ['trends', 'tests', 'care', 'setup', 'life', 'photos', 'spending'] : ['trends', 'life', 'photos', 'setup', 'tests', 'care', 'spending']);
	const SECTIONS: Record<string, { t: string; n?: number; on: boolean }> = $derived({
		trends: { t: 'Readings & events', on: hasTrends },
		tests: { t: 'Test log', n: d.testLog.rows.length, on: hasTests },
		setup: { t: 'Setup & routine', on: hasSetup },
		life: { t: 'Livestock & plants', on: hasLife },
		care: { t: 'Care log', on: hasCare },
		spending: { t: 'Spending', on: !!data.sample },
		photos: { t: 'Photos', n: stripAll.length + (v.cover ? 1 : 0) || undefined, on: v.photos.length > 0 || v.timeline.length > 0 }
	});
	const order = $derived(ORDER.filter((id) => SECTIONS[id].on));
	const nav = $derived([{ id: 'summary', t: 'Summary' as string, n: undefined as number | undefined }, ...order.map((id) => ({ id, t: SECTIONS[id].t, n: SECTIONS[id].n }))]);
	// a species' photo from Wikimedia Commons, when the server has one
	const speciesPhoto = (name: string | null) => (name ? (data.speciesPhotos[name] ?? null) : null);
	// a probe's latest reading (#19): "● Live · 9:30 AM" beside the parameter
	const liveOf = (id: string) => v.readings.find((r) => r.id === id)?.live ?? null;
	const hasSensor = $derived(d.lanes.some((l) => l.sensor.length > 1));
	// the sample tank (#301): its call to action can be put away, on this device
	let ctaHidden = $state(false);
	onMount(() => {
		try {
			ctaHidden = localStorage.getItem('wl_sample_cta') === 'hidden';
		} catch {
			/* storage blocked */
		}
	});
	function hideCta() {
		ctaHidden = true;
		try {
			localStorage.setItem('wl_sample_cta', 'hidden');
		} catch {
			/* storage blocked */
		}
	}
	const POSITION: Record<string, string> = { background: 'background', midground: 'midground', foreground: 'foreground', epiphyte: 'epiphyte', floating: 'floating' };
</script>

<PublicHead seo={data.seo} verification={data.verification} {jsonLd} />

<div class="pub">
	<header class="top" class:sample={!!data.sample}>
		<div class="top-in">
			<a href="/" class="brand" aria-label="Waterline"><Logo size={24} wordmark wordSize={16} /></a>
			{#if data.sample}
				<!-- on every screen, and it stays at the top as the page scrolls: none of this is real (#301) -->
				<span class="shared sample-tag">Sample tank · made-up data</span>
				<span class="grow"></span>
				<a class="btn act hide-phone" href="/signin">Sign in</a>
			{:else}
			<span class="shared hide-phone">Shared, read-only</span>
			<span class="grow"></span>
			<a class="btn act" href="/t/{v.slug}/summary.txt{rangeQuery}" onclick={copySummary} aria-label="Copy summary for a forum post">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="8" y="8" width="13" height="13"></rect><path d="M16 8V3H3v13h5"></path></svg>
				<span class="hide-phone">{copied ? '✓ Copied' : 'Copy summary for a forum post'}</span>
			</a>
			{#if hasTests}
				<a class="btn act" href="/t/{v.slug}/data.csv{rangeQuery}" download aria-label="Download data (CSV)">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12M6 10l6 6 6-6M4 21h16"></path></svg>
					<span class="hide-phone">Download data (CSV)</span>
				</a>
			{/if}
			{#if data.ownerTankId}<a class="btn act" href="/tanks/{data.ownerTankId}/public">Edit</a>{/if}
			{/if}
		</div>
		{#if copied}<p class="sr-only" role="status">Summary copied</p>{/if}
	</header>

	<main class="wrap">
		{#if data.sample && !ctaHidden}
			<!-- what to do next: this server's sign-in, or running your own (#301) -->
			<aside class="sample-cta" aria-label="Start your own log">
				<div class="sc-text">
					<b>This tank is made up, to show what Waterline keeps.</b>
					<span>Readings against targets, water changes on the chart, the care log, reminders and spending. Yours stays private unless you share it.</span>
					{#if data.sample.access}<span class="muted">{data.sample.access}</span>{/if}
				</div>
				<div class="sc-acts">
					<a class="btn btn-primary" href="/signin">Start your own log</a>
					<a class="btn" href={data.sample.repo} rel="noopener">Run it yourself ↗</a>
					{#if mounted}<button type="button" class="btn-text sc-close" onclick={hideCta} aria-label="Hide this">✕</button>{/if}
				</div>
			</aside>
		{/if}
		<!-- ── Who and what: the cover and recent photos, the name, the keeper's question ── -->
		<section class="intro" class:has-cover={!!v.cover}>
			{#if v.cover}
				<div class="media">
					<!-- the cover opens full size in the lightbox, like any photo on the page -->
					<a class="hero" href={photo(v.cover, 'full')} onclick={(e) => openShot(e, coverShot, 0)}
						><img
							src={photo(v.cover, 'medium')}
							srcset="{photo(v.cover, 'medium')} 1024w, {photo(v.cover, 'full')} 2048w"
							sizes="(min-width: 880px) 680px, 100vw"
							width={v.coverSize?.width}
							height={v.coverSize?.height}
							fetchpriority="high"
							alt="{v.name} aquarium"
							style:object-position={v.coverPos}
						/>{#if v.coverDate}<span class="hero-date">{v.coverDate}</span>{/if}</a
					>
					{#if strip.length}
						<div class="strip">
							{#each strip as p, i (p.id)}
								<a class="thumb" href={photo(p.id, 'full')} onclick={(e) => openShot(e, strip, i)}><img src={photo(p.id)} alt="{v.name} on {p.date}" loading="lazy" /></a>
							{/each}
							{#if stripAll.length > strip.length}<a class="thumb all" href="#photos">All {stripAll.length + 1} photos</a>{/if}
						</div>
					{/if}
				</div>
			{/if}
			<div class="head">
				<p class="eyebrow">{eyebrow}</p>
				<h1>{v.name}</h1>
				{#if byLine || testedWhen}
					<p class="by">{byLine}{#if byLine && testedWhen}{' · '}{/if}{#if testedWhen}Last water test <b>{testedWhen}</b>{/if}</p>
				{/if}
				<p class="units">{d.units}</p>
			</div>
			{#if d.question || v.description}
				<div class="story">
					{#if d.question}
						<div class="ask">
							<h2>What I'm asking about</h2>
							<blockquote class="question">{d.question}</blockquote>
						</div>
					{/if}
					{#if v.description}
						<div class="about">
							<h2>About this tank</h2>
							<p class="desc">{v.description}</p>
						</div>
					{/if}
				</div>
			{/if}
		</section>

		<!-- ── The latest readings, as tiles: what needs attention first ── -->
		{#if tiles.length}
			<section id="summary" class="summary">
				<div class="sh">
					<h2>Latest readings</h2>
					{#if testedWhen}<span class="muted">from the test {v.tested === 'today' ? 'today' : 'on ' + v.tested}{v.testedTime ? `, ${v.testedTime}` : ''}</span>{/if}
				</div>
				<ul class="tiles">
					{#each tiles as a (a.id)}
						{@const look = a.level === 'bad' || a.level === 'warn'}
						{@const lv = liveOf(a.id)}
						<li class="tile {a.level}">
							<span class="tn"><span title={a.longName}>{a.name}</span><span class="ts status-{a.level}">{a.status}</span></span>
							<span class="tv num">{a.value}{#if a.unit}{' '}<small>{a.unit}</small>{/if}</span>
							{#if a.spark.length > 1}<span class="tsp"><Sparkline values={a.spark} level={a.level} lo={a.band.min} hi={a.band.max} /></span>{/if}
							<span class="tt">{a.target ? `Target ${a.target}` : 'No target'}</span>
							{#if look && (a.prev || a.outOf)}<span class="tw">{[a.prev ? `was ${a.prev.value} on ${a.prev.day}` : null, a.outOf].filter(Boolean).join(' · ')}</span>{/if}
							{#if lv}<span class="rl" class:fresh={lv.fresh}>{lv.fresh ? '●' : '○'} {lv.text}</span>{/if}
						</li>
					{/each}
				</ul>
				{#each d.warnings as w (w)}<p class="worth"><b>Worth checking:</b> {w}</p>{/each}
			</section>
		{:else}
			<span id="summary"></span>
		{/if}

		{#if nav.length > 2}
			<nav class="secnav" aria-label="Sections">
				<div class="secnav-in">
					{#each nav as s (s.id)}<a href="#{s.id}">{s.t}{#if s.n}<span class="n">{s.n}</span>{/if}</a>{/each}
				</div>
			</nav>
		{/if}

		<!-- ── Readings & events ────────────────────────────────── -->
		{#snippet trends()}
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
		{/snippet}

		<!-- ── Test log: the newest few, the rest behind "Show all" (a checkbox, so it works without scripts) ── -->
		{#snippet tests()}
			{@const rows = d.testLog.rows}
			{@const n = rows.length}
			<section id="tests">
				<div class="sh big">
					<div>
						<h2>Water test log</h2>
						<p class="lede">Every reading as entered, newest first. Out-of-range values are shaded; a heavy rule marks a water change between two tests.</p>
					</div>
					<span class="muted">{n} {n === 1 ? 'test' : 'tests'} · {period}</span>
				</div>
				<div class="fold-box">
					{#if n > TESTS_SHOW}<input type="checkbox" id="tests-all" class="fold-cb sr-only" checked={d.details} />{/if}
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
								{#each rows as r, ri (r.id)}
									<tr class:wc={r.changeBefore} class:more={ri >= TESTS_SHOW}>
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
					<!-- phones: one block per test, out-of-range readings first, no sideways scrolling -->
					<ol class="tcards" aria-label="Water test log">
						{#each rows as r, ri (r.id)}
							{@const vals = r.cells
								.map((c, i) => (c ? { ...c, name: d.testLog.columns[i].name, unit: d.testLog.columns[i].unit } : null))
								.filter((c) => !!c)
								.sort((a, b) => Number(b.level === 'bad') - Number(a.level === 'bad'))}
							<li class="tcard" class:more={ri >= TESTS_SHOW}>
								<b class="tcd">{r.when}</b>
								<span class="tcv">
									{#each vals as c, i (i)}<span class={c.level}><span class="tcn">{c.name}</span> {c.v}{#if c.unit}{' '}<small>{c.unit}</small>{/if}{#if c.level === 'bad'}{' ✕'}<span class="sr-only"> {c.status}</span>{:else if c.level === 'warn'}{' ▲'}{/if}</span>{/each}
								</span>
								{#if d.details && r.note}<span class="tcnote">{r.note}</span>{/if}
							</li>
							{#if r.changeBefore && ri < n - 1}<li class="wcline" class:more={ri + 1 >= TESTS_SHOW} aria-label="Water change">Water change</li>{/if}
						{/each}
					</ol>
					{#if n > TESTS_SHOW}
						<label for="tests-all" class="fold-btn"><span class="fold-more">Show all {n} tests</span><span class="fold-less">Show fewer</span></label>
					{/if}
				</div>
			</section>
		{/snippet}

		<!-- ── Setup & routine: equipment and the routine always; the details fold ── -->
		{#snippet setup()}
			<section id="setup">
				<div class="sh big"><h2>Setup &amp; routine</h2><span class="muted">{period}</span></div>
				{#if setupTop}
					<div class="two">
						{#if d.gear.length || v.without.length || d.schedules.length}
							<div class="col">
								{#if d.gear.length || v.without.length}
									<div class="block">
										<h3>Equipment</h3>
										<ul class="rows gear">
											{#each d.gear as g (g.id)}
												<li><span class="gt">{g.type}</span><span class="gn"><b>{g.name}</b>{#if g.spec}<span class="muted">{` · ${g.spec}`}</span>{/if}</span><span class:fresh={g.fresh} class="gs">{g.since ? (g.fresh ? `New ${g.since}` : `since ${g.since}`) : ''}</span></li>
											{/each}
											{#each v.without as w (w)}<li><span class="gt">{w}</span><span class="gn muted">None, on purpose</span><span></span></li>{/each}
										</ul>
									</div>
								{/if}
								{#if d.schedules.length}
									<div class="block">
										<h3>Daily schedule</h3>
										{#each d.schedules as s, i (i)}
											<div class="sched">
												<span class="sname">{s.name}</span>
												<div class="day" role="img" aria-label="{s.name} {s.bars.map((b) => b.label).filter(Boolean).join(', ')}">
													{#each s.bars as b, j (j)}<i class:co2={s.name !== 'Light'} style:left="{b.from * 100}%" style:width="{(b.to - b.from) * 100}%"></i>{/each}
												</div>
												<span class="stext">{s.bars.map((b) => b.label).filter(Boolean).join(', ')}{s.text ? ` · ${s.text}` : ''}</span>
											</div>
										{/each}
										<div class="hours" aria-hidden="true"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
									</div>
								{/if}
							</div>
						{/if}
						{#if d.routine?.waterChanges}
							<div class="col">
								<div class="block">
									<h3>Routine</h3>
									<div class="stats">
										<div><b class="num">{d.routine.waterChanges}</b><span>water {d.routine.waterChanges === 1 ? 'change' : 'changes'}</span></div>
										{#if d.routine.avgPct}<div><b class="num">{d.routine.avgPct}</b><span>average change</span></div>{/if}
										{#if d.routine.avgGap}<div><b class="num">{d.routine.avgGap}</b><span>average gap</span></div>{/if}
									</div>
									{#if d.routine.sources}<p class="muted small">Water: {d.routine.sources}</p>{/if}
								</div>
							</div>
						{/if}
					</div>
				{/if}
				{#snippet setupDetails()}
						<div class="two">
							{#if d.setup.length}
								<div class="col">
									<div class="block">
										<h3>The tank</h3>
										<dl class="facts">
											{#each d.setup as [k, val] (k)}<dt>{k}</dt><dd>{val}</dd>{/each}
										</dl>
									</div>
								</div>
							{/if}
							{#if d.routine?.dosing.length || d.routine?.feeding === false || d.schedule.length}
								<div class="col">
									{#if d.routine?.dosing.length}
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
									{#if d.routine?.feeding === false}<p class="muted small">Feeding not logged in this period.</p>{/if}
									{#if d.schedule.length}
										<div class="block">
											<h3>Schedule</h3>
											<ul class="rows">
												{#each d.schedule as t, i (i)}<li class="two-col"><span>{t.name} · {t.every}</span><span class:overdue={t.overdue}>{t.due}</span></li>{/each}
											</ul>
										</div>
									{/if}
								</div>
							{/if}
						</div>
				{/snippet}
				{#if setupMore && setupTop}
					<details class="fold" open={d.details}>
						<summary><span class="fold-more">Show the tank's details{d.routine?.dosing.length ? ', dosing' : ''}{d.schedule.length ? ' and schedule' : ''}</span><span class="fold-less">Show less</span></summary>
						{@render setupDetails()}
					</details>
				{:else if setupMore}
					{@render setupDetails()}
				{/if}
			</section>
		{/snippet}

		<!-- ── Livestock & plants: cards with the species' photos ── -->
		{#snippet life()}
			{@const animalCount = d.animals.reduce((n, a) => n + a.count, 0)}
			<section id="life">
				<div class="sh big">
					<h2>Livestock &amp; plants</h2>
					<span class="muted">{[animalCount ? `${animalCount} ${animalCount === 1 ? 'animal' : 'animals'}` : null, d.plants.length ? `${d.plants.length} ${d.plants.length === 1 ? 'plant' : 'plants'}` : null].filter(Boolean).join(' · ')}</span>
				</div>
				{#snippet credit(c: NonNullable<ReturnType<typeof speciesPhoto>>['credit'])}
					<span class="credit">Photo: {c.author} · {#if c.licenseUrl}<a href={c.licenseUrl} target="_blank" rel="noopener noreferrer">{c.license}</a>{:else}{c.license}{/if} · <a href={c.pageUrl} target="_blank" rel="noopener noreferrer">Wikimedia Commons</a></span>
				{/snippet}
				{#if d.animals.length}
					<ul class="cards">
						{#each d.animals as a (a.id)}
							{@const sp = speciesPhoto(a.lookup)}
							{@const care = d.care.find((c) => c.name === a.species)}
							<li class="lcard">
								{#if sp}<img class="pic" src={sp.src} alt={a.species} loading="lazy" />{:else}<span class="pic none photo-placeholder" aria-hidden="true"><CategoryIcon kind="livestock" size={40} /></span>{/if}
								<div class="cb">
									<span class="row1"><h3 class="nm">{a.name}</h3><span class="cnt num">{a.count}<small> ×</small></span></span>
									{#if a.scientific}<span class="sci">{a.scientific}</span>{/if}
									{#if a.since}<span class="muted small">Added {a.since}</span>{/if}
									{#if care}<span class="care">{care.line}</span>{/if}
									{#if sp}{@render credit(sp.credit)}{/if}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
				{#if d.losses.length}
					<div class="losses">
						<h3>Losses · {d.lostCount} in {period}</h3>
						<ul>
							{#each d.losses as l, i (i)}<li><b>{l.day}</b> · {l.text}{#if l.note}{' · '}<span class="muted">{l.note}</span>{/if}</li>{/each}
						</ul>
					</div>
				{/if}
				{#if d.plants.length}
					<h3 class="subh">Plants</h3>
					<ul class="plants">
						{#each d.plants as p (p.id)}
							{@const sp = speciesPhoto(p.lookup)}
							<li>
								{#if sp}<img class="pic" src={sp.src} alt={p.name} loading="lazy" />{:else}<span class="pic none photo-placeholder" aria-hidden="true"><CategoryIcon kind="plant" size={36} /></span>{/if}
								<b class="pn">{p.name}</b>
								<span class="pp">{POSITION[p.position] ?? p.position}</span>
								{#if sp}{@render credit(sp.credit)}{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/snippet}

		<!-- ── Care log: the latest few days, the rest folded ───── -->
		{#snippet care()}
			{#snippet careDay(day: (typeof careDays)[number])}
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
			{/snippet}
			<section id="care">
				<div class="sh big">
					<h2>Care log</h2>
					{#if mounted && kinds.length > 2}
						<div class="filters" role="group" aria-label="Show in the care log">
							{#each kinds as k (k.k)}<button type="button" class="chip" aria-pressed={kind === k.k} onclick={() => (kind = k.k)}>{k.t}</button>{/each}
						</div>
					{/if}
				</div>
				<div>
					{#each careDays.slice(0, CARE_SHOW) as day (day.day)}{@render careDay(day)}{/each}
				</div>
				{#if careDays.length > CARE_SHOW}
					<details class="fold" open={d.details}>
						<summary><span class="fold-more">Show {careDays.length - CARE_SHOW} earlier {careDays.length - CARE_SHOW === 1 ? 'day' : 'days'}</span><span class="fold-less">Show fewer</span></summary>
						<div>
							{#each careDays.slice(CARE_SHOW) as day (day.day)}{@render careDay(day)}{/each}
						</div>
					</details>
				{/if}
			</section>
		{/snippet}

		<!-- ── Spending: the sample tank only; a real tank's spending is never public (#301) ── -->
		{#snippet spending()}
			{#if data.sample}
				<section id="spending">
					<div class="sh big"><h2>Spending</h2><span class="muted">{data.sample.spending.total} in all</span></div>
					<div class="spend">
						<ul class="spend-list">
							{#each data.sample.spending.byCategory as c (c.label)}<li><span>{c.label}</span><b class="num">{c.amount}</b></li>{/each}
						</ul>
						<div>
							<h3 class="spend-h">Latest</h3>
							<ul class="spend-list">
								{#each data.sample.spending.recent as r, i (i)}<li><span>{r.what} <span class="muted">· {r.date}</span></span><b class="num">{r.amount}</b></li>{/each}
							</ul>
						</div>
					</div>
				</section>
			{/if}
		{/snippet}

		<!-- ── Photos and the timeline ──────────────────────────── -->
		{#snippet photos()}
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
											{#each e.readings as r, j (j)}
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
		{/snippet}

		{#each order as id (id)}
			{#if id === 'trends'}{@render trends()}
			{:else if id === 'tests'}{@render tests()}
			{:else if id === 'setup'}{@render setup()}
			{:else if id === 'life'}{@render life()}
			{:else if id === 'care'}{@render care()}
			{:else if id === 'spending'}{@render spending()}
			{:else if id === 'photos'}{@render photos()}{/if}
		{/each}

		<footer class="foot">
			<span class="fl"><Logo size={18} />{data.sample ? "Sample tank · made-up data, nothing here is saved" : "Shared from Waterline · read-only"}</span>
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
	/* the sample tank (#301): its label stays in view, in the accent, as the page scrolls */
	.top.sample {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--bg);
	}
	.sample-tag {
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: 700;
	}
	.sample-cta {
		margin-top: 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px 16px;
		background: var(--surface);
		border-left: 3px solid var(--accent);
	}
	.sc-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 14px;
		line-height: 1.45;
	}
	.sc-acts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.sc-acts .btn {
		min-height: 44px;
	}
	.sc-close {
		min-width: 44px;
		min-height: 44px;
		margin-left: auto;
	}
	.spend {
		display: grid;
		gap: 24px;
	}
	.spend-h {
		margin: 0 0 4px;
		font-size: 13px;
		color: var(--text-muted);
	}
	.spend-list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 2px solid var(--ink);
	}
	.spend-list li {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 10px 0;
		border-bottom: 1px solid var(--divider);
	}
	@media (min-width: 1024px) {
		.sample-cta {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}
		.spend {
			grid-template-columns: 1fr 1fr;
			gap: 32px;
		}
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
		gap: 44px;
	}
	@media (min-width: 720px) {
		.wrap {
			gap: 56px;
		}
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

	/* ── Cover, title and the keeper's words ─────────────────── */
	.intro {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 18px;
	}
	.media {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0 -20px;
		min-width: 0;
	}
	.hero {
		position: relative;
		display: block;
		aspect-ratio: 16 / 10;
		max-width: 100%;
		overflow: hidden;
		background: var(--surface);
	}
	.hero img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.hero-date {
		position: absolute;
		left: 10px;
		bottom: 10px;
		padding: 3px 8px;
		background: var(--overlay-bg);
		color: var(--overlay-text);
		font-size: 12px;
		font-weight: 600;
	}
	.strip {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 6px;
		padding: 0 20px;
	}
	.thumb {
		display: block;
		aspect-ratio: 1;
		max-width: 100%;
		overflow: hidden;
		background: var(--surface);
	}
	.thumb img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.thumb.all {
		display: grid;
		place-items: center;
		padding: 4px;
		text-align: center;
		font-size: 13px;
		font-weight: 700;
		line-height: 1.25;
		color: var(--text);
		text-decoration: none;
	}
	.thumb.all:hover {
		background: var(--surface-hi);
	}
	.head {
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
		font-size: 44px;
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
	.story {
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-width: 0;
	}
	.story h2 {
		font-size: 15px;
		margin-bottom: 6px;
	}
	.ask {
		padding: 14px 16px;
		background: var(--surface);
		border-left: 4px solid var(--accent);
	}
	.question {
		margin: 0;
		font-size: 17px;
		line-height: 1.45;
		white-space: pre-line;
	}
	.about {
		padding-top: 14px;
		border-top: 2px solid var(--ink);
	}
	.desc {
		margin: 0;
		font-size: 15px;
		line-height: 1.6;
		color: var(--text-2);
		white-space: pre-line;
		max-width: 65ch;
	}
	@media (min-width: 720px) {
		.intro {
			padding-top: 40px;
		}
		.media {
			margin: 0;
		}
		.strip {
			padding: 0;
		}
		h1 {
			font-size: 60px;
		}
		/* no photo: the name on the left, the keeper's words beside it */
		.intro:not(.has-cover) {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 40px;
			align-items: end;
		}
	}
	@media (min-width: 880px) {
		/* the cover large on the left; the name, then the keeper's words, beside it */
		.intro.has-cover {
			grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
			grid-template-rows: auto 1fr;
			column-gap: 40px;
			row-gap: 22px;
		}
		.intro.has-cover .media {
			grid-row: 1 / span 2;
		}
	}

	/* ── Section nav: it scrolls sideways on a phone, and fades at the edge to say so ── */
	.secnav {
		position: relative;
		margin-top: -16px;
		border-top: 2px solid var(--ink);
		border-bottom: 1px solid var(--divider);
	}
	.secnav::after {
		content: '';
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: 40px;
		pointer-events: none;
		background: linear-gradient(to right, transparent, var(--bg));
	}
	.secnav-in {
		display: flex;
		gap: 4px 22px;
		overflow-x: auto;
		scrollbar-width: none;
		padding: 6px 40px 6px 0;
		font-size: 15px;
		font-weight: 600;
		white-space: nowrap;
	}
	.secnav-in::-webkit-scrollbar {
		display: none;
	}
	.secnav a {
		color: var(--text);
		text-decoration: none;
		min-height: 44px;
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
	@media (min-width: 1024px) {
		.secnav::after {
			display: none;
		}
	}

	/* ── Latest readings: tiles, what needs attention first ─── */
	.tiles {
		list-style: none;
		margin: -14px 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		overflow: hidden;
		border-bottom: 1px solid var(--divider);
	}
	/* 1px rules between tiles; the ones past the edges are clipped */
	.tile {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		padding: 14px 14px 12px;
		box-shadow:
			-1px 0 0 var(--divider-soft),
			0 -1px 0 var(--divider-soft);
	}
	.tile.bad {
		background: var(--bad-bg);
		box-shadow:
			inset 0 4px 0 var(--accent),
			-1px 0 0 var(--divider-soft),
			0 -1px 0 var(--divider-soft);
	}
	.tn {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 6px;
		font-size: 14px;
		font-weight: 600;
	}
	.ts {
		font-size: 12px;
		font-weight: 700;
		white-space: nowrap;
	}
	.tv {
		margin-top: 2px;
		font-size: 32px;
		font-weight: 800;
		line-height: 1.1;
		letter-spacing: -0.01em;
	}
	.tile.bad .tv {
		color: var(--bad-text);
	}
	.tv small {
		font-size: 13px;
		font-weight: 400;
		letter-spacing: 0;
		color: var(--text-muted);
	}
	.tsp {
		display: block;
		height: 24px;
		margin: 4px 0 2px;
	}
	.tt {
		font-size: 12px;
		color: var(--text-muted);
	}
	.tw {
		font-size: 12px;
		color: var(--text-2);
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
		margin: 0;
		padding: 10px 12px;
		background: var(--surface);
		font-size: 13px;
		color: var(--text-2);
	}
	@media (max-width: 479px) {
		/* a reading out of range takes the whole row */
		.tile.bad {
			grid-column: 1 / -1;
		}
		.tv {
			font-size: 28px;
		}
	}

	/* ── Folds: the newest few show, the rest behind one link ─ */
	.fold-box {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.fold-cb:not(:checked) ~ * .more {
		display: none;
	}
	.fold-btn,
	.fold > summary {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		font-size: 15px;
		font-weight: 700;
		color: var(--accent-text);
		cursor: pointer;
		list-style: none;
	}
	.fold > summary::-webkit-details-marker {
		display: none;
	}
	.fold-btn::before,
	.fold > summary::before {
		content: '+';
		display: inline-grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border: 1.5px solid currentColor;
		font-size: 14px;
		line-height: 1;
	}
	.fold-cb:checked ~ .fold-btn::before,
	.fold[open] > summary::before {
		content: '–';
	}
	.fold-cb:focus-visible ~ .fold-btn {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.fold-less,
	.fold-cb:checked ~ .fold-btn .fold-more,
	.fold[open] > summary .fold-more {
		display: none;
	}
	.fold-cb:checked ~ .fold-btn .fold-less,
	.fold[open] > summary .fold-less {
		display: inline;
	}
	/* open, the link moves under what it opened */
	.fold {
		display: flex;
		flex-direction: column;
	}
	.fold[open] {
		flex-direction: column-reverse;
	}
	.fold[open] > :not(summary) {
		margin-bottom: 6px;
	}
	/* the care log's earlier days carry straight on from the latest */
	#care .fold {
		margin-top: -14px;
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

	/* phones: one block per test instead of a table that scrolls sideways */
	.tcards {
		display: none;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tcard {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 10px 0;
		border-bottom: 1px solid var(--divider-soft);
	}
	.tcd {
		font-size: 14px;
	}
	.tcv {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		font-size: 14px;
		font-variant-numeric: tabular-nums;
	}
	.tcv > span {
		white-space: nowrap;
	}
	.tcv small {
		font-size: 11px;
		color: var(--text-muted);
	}
	.tcn {
		font-size: 12px;
		color: var(--text-muted);
	}
	.tcv .bad {
		color: var(--bad-text);
		font-weight: 700;
	}
	.tcv .warn {
		font-weight: 700;
	}
	.tcnote {
		font-size: 13px;
		color: var(--text-2);
	}
	.wcline {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 0;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.wcline::before,
	.wcline::after {
		content: '';
		flex: 1;
		height: 2px;
		background: var(--ink);
	}
	@media (max-width: 599px) {
		#tests .tbox {
			display: none;
		}
		.tcards {
			display: block;
		}
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
	.gear .gn {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	/* ── Livestock & plants: cards with the species' photos ── */
	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
		gap: 24px;
	}
	.lcard {
		display: flex;
		flex-direction: column;
		min-width: 0;
		border-bottom: 1px solid var(--divider);
	}
	.pic {
		display: block;
		width: 100%;
		aspect-ratio: 4 / 3;
		max-width: 100%;
		object-fit: cover;
	}
	img.pic {
		background: var(--surface);
	}
	.pic.none {
		display: grid;
		place-items: center;
	}
	.cb {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 12px 0 14px;
		min-width: 0;
	}
	.row1 {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
	}
	.nm {
		font-size: 17px;
		font-weight: 700;
		letter-spacing: 0;
		text-transform: none;
		color: var(--text);
	}
	.cnt {
		font-size: 26px;
		font-weight: 800;
		line-height: 1;
	}
	.cnt small {
		font-size: 12px;
		font-weight: 400;
		color: var(--text-muted);
	}
	.sci {
		font-style: italic;
		font-size: 14px;
		color: var(--text-muted);
	}
	.care {
		margin-top: 4px;
		font-size: 13px;
		color: var(--text-2);
	}
	.credit {
		margin-top: 4px;
		font-size: 11px;
		line-height: 1.4;
		color: var(--text-muted);
	}
	.credit a {
		color: var(--text-2);
	}
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
	.subh {
		margin-top: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--divider);
	}
	.plants {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 180px), 1fr));
		gap: 20px;
	}
	.plants li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.plants .pic {
		aspect-ratio: 1;
		margin-bottom: 6px;
	}
	.pn {
		font-size: 14px;
	}
	.pp {
		font-size: 12px;
		color: var(--text-muted);
	}
	@media (max-width: 599px) {
		/* phones: the photo beside the words */
		.cards {
			gap: 0;
		}
		.lcard {
			display: grid;
			grid-template-columns: 112px minmax(0, 1fr);
			gap: 14px;
			padding: 12px 0;
		}
		.lcard .pic {
			aspect-ratio: 1;
		}
		.cb {
			padding: 0;
		}
		.plants {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 16px;
		}
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
		/* equipment: one line each, unless it's new in the period */
		.rows.gear li .gs:not(.fresh) {
			display: none;
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
