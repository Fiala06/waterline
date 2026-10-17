<script lang="ts">
	// Calculators (#18): seven small tools, each a section under a 2px rule, filled
	// in from the tank: its size and volumes, the latest readings and targets, and
	// saved products with a strength. Everything is in the keeper's units.
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { hscroll } from '$lib/actions';
	import {
		afterWaterChange,
		co2Ppm,
		co2Status,
		doseForPpm,
		heaterSize,
		HEATER_SIZES,
		phForCo2,
		ppmFromDose,
		remineralize,
		strengthMgPerMl,
		SUBSTRATE_DENSITY,
		substrateAmount,
		tankVolume,
		waterChangeFraction,
		waterChangeTarget,
		WATTS_PER_L_PER_C
	} from '$lib/calculators';
	import { fmtGrams, fmtVolume, fmtWeight } from '$lib/calculators-format';
	import { formatNumber, galToL, parseNumber, toDisplay, toStored } from '$lib/units';

	let { data, form } = $props();
	const u = $derived(data.user);
	const t = $derived(data.tank);
	const n = (s: string) => parseNumber(s);
	const fmt = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '—' : formatNumber(v, d));
	// the keeper's units → stored, for the arithmetic
	const toCm = (v: number) => toStored(v, 'length', u);
	const toL = (v: number) => toStored(v, 'volume', u);
	const toC = (v: number) => toStored(v, 'temp', u);
	const toDkh = (v: number) => toStored(v, 'hardness', u);
	const fromL = (v: number) => toDisplay(v, 'volume', u);

	// the everyday ones first; the chemistry ones under Advanced, in plain words (#67)
	const SECTIONS = [
		{ id: 'volume', label: 'Tank volume' },
		{ id: 'water-change', label: 'Water change' },
		{ id: 'heater', label: 'Heater size' },
		{ id: 'substrate', label: 'Substrate' }
	];
	const ADVANCED = [
		{ id: 'dose', label: 'Dose → ppm', plain: 'What a fertilizer dose adds' },
		{ id: 'co2', label: 'CO₂ from pH and KH', plain: 'CO₂ level' },
		{ id: 'remineralize', label: 'GH / KH for RO water', plain: 'Minerals for RO water' }
	];

	// ── Tank volume ──
	let vl = $state(untrack(() => data.tank?.length ?? ''));
	let vw = $state(untrack(() => data.tank?.width ?? ''));
	let vh = $state(untrack(() => data.tank?.height ?? ''));
	// saved with the volume, so they're here next time (#78)
	let glass = $state(untrack(() => data.tank?.glass ?? ''));
	let vSub = $state(untrack(() => data.tank?.substrateDepth ?? ''));
	let vGap = $state(untrack(() => data.tank?.rimGap ?? ''));
	const vol = $derived.by(() => {
		const [L, W, H] = [n(vl), n(vw), n(vh)];
		if (L == null || W == null || H == null) return null;
		return tankVolume({ lengthCm: toCm(L), widthCm: toCm(W), heightCm: toCm(H), glassCm: toCm(n(glass) ?? 0), substrateCm: toCm(n(vSub) ?? 0), gapCm: toCm(n(vGap) ?? 0) });
	});

	// ── Water change ──
	// the reading asked for in the address (#90), else nitrate, else the first with a reading or target
	const wcStart = untrack(() => data.params.find((p) => p.id === data.pick) ?? data.readings.no3 ?? data.params[0] ?? null);
	let wcParam = $state(wcStart?.id ?? '');
	const wcP = $derived(data.params.find((p) => p.id === wcParam) ?? null);
	let wcFrom = $state(wcStart?.value ?? '');
	// "Down to" starts below the reading, never on an impossible target (#66)
	type WcParam = { value: string; min: string; max: string };
	const downTo = (p: WcParam | null | undefined) => {
		if (!p) return '';
		const t = waterChangeTarget(n(p.value), n(p.min), n(p.max));
		return t == null ? '' : formatNumber(t, 2);
	};
	let wcTo = $state(downTo(wcStart));
	let wcFresh = $state('0');
	let wcVolume = $state(untrack(() => data.tank?.actualVolume || data.tank?.nominalVolume || ''));
	function pickParam() {
		if (!wcP) return;
		wcFrom = wcP.value;
		wcTo = downTo(wcP);
	}
	const wc = $derived.by(() => {
		const [from, to, fresh] = [n(wcFrom), n(wcTo), n(wcFresh) ?? 0];
		if (from == null || to == null) return null;
		const f = waterChangeFraction(from, to, fresh);
		if (f == null) return { impossible: true as const, from, to, fresh };
		const volume = n(wcVolume);
		return { impossible: false as const, fraction: f, amount: volume ? volume * f : null, from, to, fresh };
	});
	// and the other way: what 25 % (or any share) does
	let wcShare = $state('25');
	const wcAfter = $derived.by(() => {
		const [from, share, fresh] = [n(wcFrom), n(wcShare), n(wcFresh) ?? 0];
		return from == null || share == null ? null : afterWaterChange(from, share / 100, fresh);
	});

	// ── Dose → ppm ──
	let product = $state(untrack(() => data.products[0]?.id ?? 'own'));
	let dDose = $state('5');
	let dPer = $state(untrack(() => data.imperial ? '10' : '50'));
	let dPpm = $state('1');
	let dVolume = $state(untrack(() => data.tank?.actualVolume || data.tank?.nominalVolume || ''));
	let dAmount = $state('5');
	let dTarget = $state('10');
	const saved = $derived(data.products.find((p) => p.id === product) ?? null);
	const mgPerMl = $derived.by(() => {
		if (saved) return saved.mgPerMl;
		const [dose, per, ppm] = [n(dDose), n(dPer), n(dPpm)];
		return dose == null || per == null || ppm == null ? null : strengthMgPerMl(dose, toL(per), ppm);
	});
	const dosePpm = $derived(mgPerMl != null && n(dAmount) != null && n(dVolume) != null ? ppmFromDose(n(dAmount)!, mgPerMl, toL(n(dVolume)!)) : null);
	const doseFor = $derived(mgPerMl != null && n(dTarget) != null && n(dVolume) != null ? doseForPpm(n(dTarget)!, mgPerMl, toL(n(dVolume)!)) : null);

	// ── Heater ──
	let hVolume = $state(untrack(() => data.tank?.actualVolume || data.tank?.nominalVolume || ''));
	let hRoom = $state(untrack(() => data.imperial ? '68' : '20'));
	let hTarget = $state(untrack(() => data.readings.temp?.max || data.readings.temp?.value || (data.imperial ? '78' : '26')));
	const heater = $derived.by(() => {
		const [v, r, g] = [n(hVolume), n(hRoom), n(hTarget)];
		return v == null || r == null || g == null ? null : heaterSize(toL(v), toC(r), toC(g));
	});

	// ── Substrate ──
	let sl = $state(untrack(() => data.tank?.length ?? ''));
	let sw = $state(untrack(() => data.tank?.width ?? ''));
	let sFront = $state(untrack(() => data.imperial ? '1.5' : '4'));
	let sBack = $state(untrack(() => data.imperial ? '3' : '8'));
	let sKind = $state('gravel');
	const sub = $derived.by(() => {
		const [L, W, f, b] = [n(sl), n(sw), n(sFront), n(sBack)];
		return L == null || W == null || f == null || b == null ? null : substrateAmount(toCm(L), toCm(W), toCm(f), toCm(b), sKind);
	});

	// ── CO₂ ──
	let cPh = $state(untrack(() => data.readings.ph?.value ?? ''));
	let cKh = $state(untrack(() => data.readings.kh?.value ?? ''));
	let cTarget = $state('30');
	const co2 = $derived.by(() => {
		const [ph, kh] = [n(cPh), n(cKh)];
		return ph == null || kh == null ? null : co2Ppm(ph, toDkh(kh));
	});
	const co2Ph = $derived(n(cKh) != null && n(cTarget) != null ? phForCo2(n(cTarget)!, toDkh(n(cKh)!)) : null);

	// ── Remineralize ──
	let rVolume = $state(untrack(() => data.tank?.actualVolume || data.tank?.nominalVolume || ''));
	let rKh = $state(untrack(() => data.readings.kh?.min || data.readings.kh?.max || (data.hardnessPpm ? '54' : '3')));
	let rGh = $state(untrack(() => data.readings.gh?.min || data.readings.gh?.max || (data.hardnessPpm ? '107' : '6')));
	const rem = $derived.by(() => {
		const [v, kh, gh] = [n(rVolume), n(rKh), n(rGh)];
		return v == null || kh == null || gh == null ? null : remineralize(toL(v), toDkh(kh), toDkh(gh));
	});

	const vUnit = $derived(data.units.vol);
	const lUnit = $derived(data.units.len);
	// a stored per-litre figure read in the keeper's volume unit ("5 W per gal")
	const perVol = (perL: number) => (data.imperial ? perL * galToL(1) : perL);
</script>

<svelte:head><title>Calculators · Waterline</title></svelte:head>

{#snippet field(id: string, label: string, value: string, set: (v: string) => void, unit = '', step = '')}
	<div class="field">
		<label class="label" for={id}>{label}</label>
		<div class="unit-input">
			<input {id} inputmode="decimal" autocomplete="off" {value} oninput={(e) => set(e.currentTarget.value)} placeholder={step} />
			{#if unit}<span class="unit">{unit}</span>{/if}
		</div>
	</div>
{/snippet}

<div class="page sub-page">
	<div class="phead hide-desk">
		<span class="kicker">{t ? `For ${t.name}` : 'Every tank'}</span>
		<h1 class="title">Calculators</h1>
	</div>

	<div class="layout">
		<nav class="side hide-phone" aria-label="Calculators">
			{#each SECTIONS as s (s.id)}<a href="#{s.id}">{s.label}</a>{/each}
			<span class="side-h">Advanced</span>
			{#each ADVANCED as s (s.id)}<a href="#{s.id}" class="adv">{s.label}<small>{s.plain}</small></a>{/each}
		</nav>
		<div class="chips hide-desk" use:hscroll>
			{#each SECTIONS as s (s.id)}<a class="chip" href="#{s.id}">{s.label}</a>{/each}
			<a class="chip" href="#advanced">Advanced ›</a>
		</div>

		<div class="content">
			{#if data.tanks.length > 1}
				<label class="for">
					<span class="label">Filled in from</span>
					<select class="input" value={t?.id ?? ''} onchange={(e) => location.assign(`/calculators?tank=${e.currentTarget.value}${page.url.hash}`)}>
						{#each data.tanks as tk (tk.id)}<option value={tk.id}>{tk.name}</option>{/each}
					</select>
				</label>
			{/if}
			{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}

			<!-- 1 · Tank volume -->
			<section id="volume" class="sec" aria-labelledby="volume-h">
				<h2 id="volume-h">Tank volume</h2>
				<p class="lede">From the outside size. Take off the glass, the substrate and the air gap under the rim for what the water actually fills.</p>
				<!-- saved: the page reloads, so the other calculators start from the new volume -->
				<form
					method="POST"
					action="?/saveVolume"
					use:enhance={() =>
						async ({ result, update }) => {
							if (result.type !== 'redirect') return update();
							// the same address with #volume would only scroll: reload it instead
							const to = new URL(result.location, location.href);
							if (to.pathname + to.search === location.pathname + location.search) {
								history.replaceState(null, '', to);
								location.reload();
							} else location.assign(to);
						}}
				>
					<input type="hidden" name="tankId" value={t?.id ?? ''} />
					<div class="grid3">
						<div class="field">
							<label class="label" for="v-l">Length</label>
							<div class="unit-input"><input id="v-l" name="length" inputmode="decimal" autocomplete="off" bind:value={vl} /><span class="unit">{lUnit}</span></div>
						</div>
						<div class="field">
							<label class="label" for="v-w">Width</label>
							<div class="unit-input"><input id="v-w" name="width" inputmode="decimal" autocomplete="off" bind:value={vw} /><span class="unit">{lUnit}</span></div>
						</div>
						<div class="field">
							<label class="label" for="v-h">Height</label>
							<div class="unit-input"><input id="v-h" name="height" inputmode="decimal" autocomplete="off" bind:value={vh} /><span class="unit">{lUnit}</span></div>
						</div>
						<div class="field">
							<label class="label" for="v-g">Glass · optional</label>
							<div class="unit-input"><input id="v-g" name="glass" inputmode="decimal" autocomplete="off" bind:value={glass} placeholder="0" /><span class="unit">{lUnit}</span></div>
						</div>
						<div class="field">
							<label class="label" for="v-s">Substrate depth</label>
							<div class="unit-input"><input id="v-s" name="substrate" inputmode="decimal" autocomplete="off" bind:value={vSub} placeholder="0" /><span class="unit">{lUnit}</span></div>
						</div>
						<div class="field">
							<label class="label" for="v-gap">Below the rim</label>
							<div class="unit-input"><input id="v-gap" name="gap" inputmode="decimal" autocomplete="off" bind:value={vGap} placeholder="0" /><span class="unit">{lUnit}</span></div>
						</div>
					</div>
					<div class="results">
						<div class="result">
							<span class="r-k">Holds</span>
							<span class="r-v">{vol ? fmt(fromL(vol.grossL)) : '—'}<small>{vUnit}</small></span>
						</div>
						<div class="result">
							<span class="r-k">Water</span>
							<span class="r-v">{vol ? fmt(fromL(vol.waterL)) : '—'}<small>{vUnit}</small></span>
							{#if t?.actualVolume}<span class="r-s">Saved now: {t.actualVolume} {vUnit}</span>{:else if t?.nominalVolume}<span class="r-s">Nominal: {t.nominalVolume} {vUnit}</span>{/if}
						</div>
						{#if t}
							<button class="btn btn-primary save" disabled={!vol || vol.waterL <= 0}>Save as the tank's water volume</button>
						{/if}
					</div>
				</form>
			</section>

			<!-- 2 · Water change -->
			<section id="water-change" class="sec" aria-labelledby="wc-h">
				<h2 id="wc-h">Water change</h2>
				<p class="lede">How much to change to bring a reading down to where you want it, when the new water reads lower.</p>
				{#if data.params.length}
					<div class="field">
						<label class="label" for="wc-p">Reading</label>
						<select class="input" id="wc-p" bind:value={wcParam} onchange={pickParam}>
							{#each data.params as p (p.id)}<option value={p.id}>{p.name}{p.value ? ` · now ${p.value} ${p.unit}` : ''}</option>{/each}
						</select>
					</div>
				{/if}
				<div class="grid3">
					{@render field('wc-from', 'From', wcFrom, (v) => (wcFrom = v), wcP?.unit ?? 'ppm')}
					{@render field('wc-to', 'Down to', wcTo, (v) => (wcTo = v), wcP?.unit ?? 'ppm')}
					{@render field('wc-fresh', 'New water reads', wcFresh, (v) => (wcFresh = v), wcP?.unit ?? 'ppm', '0')}
					{@render field('wc-vol', 'Tank water', wcVolume, (v) => (wcVolume = v), vUnit)}
				</div>
				<div class="results">
					{#if wc?.impossible}
						<p class="status bad">✕ A water change can't get there{wc.to >= wc.from ? ': the target is above the reading' : wc.to < wc.fresh ? ': the new water reads more than the target' : ''}.</p>
					{:else}
						<div class="result">
							<span class="r-k">Change</span>
							<span class="r-v">{wc ? fmt(wc.fraction * 100, 0) : '—'}<small>%</small></span>
						</div>
						<div class="result">
							<span class="r-k">That's</span>
							<span class="r-v">{wc?.amount != null ? fmt(wc.amount) : '—'}<small>{vUnit}</small></span>
							{#if wc && wc.fraction > 0.5}<span class="r-s">▲ Over half at once: consider two changes a day apart.</span>{/if}
						</div>
					{/if}
				</div>
				<div class="other">
					<label class="inline">
						<span>Or, changing</span>
						<input inputmode="decimal" class="short" bind:value={wcShare} aria-label="Share of the water changed, percent" />
						<span>% brings it to <b>{wcAfter == null ? '—' : fmt(wcAfter)} {wcP?.unit ?? 'ppm'}</b>.</span>
					</label>
				</div>
			</section>

			<!-- 3 · Heater -->
			<section id="heater" class="sec" aria-labelledby="heater-h">
				<h2 id="heater-h">Heater size</h2>
				<p class="lede">From the water volume and how far above the room the tank is kept. About {formatNumber(perVol(WATTS_PER_L_PER_C), 2)} W per {vUnit} for each {data.imperial ? '°F' : '°C'}{data.imperial ? ' × 1.8' : ''}, rounded up to a common size.</p>
				<div class="grid3">
					{@render field('h-vol', 'Tank water', hVolume, (v) => (hVolume = v), vUnit)}
					{@render field('h-room', 'Room, at its coldest', hRoom, (v) => (hRoom = v), data.units.temp)}
					{@render field('h-target', 'Tank temperature', hTarget, (v) => (hTarget = v), data.units.temp)}
				</div>
				<div class="results">
					<div class="result">
						<span class="r-k">Needs about</span>
						<span class="r-v">{heater ? heater.watts : '—'}<small>W</small></span>
					</div>
					<div class="result">
						<span class="r-k">Buy</span>
						<span class="r-v buy">{heater?.buy ?? '—'}</span>
						{#if heater && heater.watts > 300}<span class="r-s">Two heaters: when one sticks on, the tank doesn't cook.</span>{/if}
					</div>
				</div>
				<p class="note">Common sizes: {HEATER_SIZES.join(', ')} W. A room that drops at night needs the colder figure.</p>
			</section>

			<!-- 4 · Substrate -->
			<section id="substrate" class="sec" aria-labelledby="sub-h">
				<h2 id="sub-h">Substrate</h2>
				<p class="lede">How much to buy for the footprint, sloping from the front up to the back.</p>
				<div class="grid3">
					{@render field('s-l', 'Length', sl, (v) => (sl = v), lUnit)}
					{@render field('s-w', 'Width', sw, (v) => (sw = v), lUnit)}
					<div class="field">
						<label class="label" for="s-k">Kind</label>
						<select class="input" id="s-k" bind:value={sKind}>
							{#each Object.entries(SUBSTRATE_DENSITY) as [k, d] (k)}<option value={k}>{d.label}</option>{/each}
						</select>
					</div>
					{@render field('s-f', 'Depth at the front', sFront, (v) => (sFront = v), lUnit)}
					{@render field('s-b', 'Depth at the back', sBack, (v) => (sBack = v), lUnit)}
				</div>
				<div class="results">
					<div class="result">
						<span class="r-k">Volume</span>
						<span class="r-v">{sub ? fmt(fromL(sub.litres)) : '—'}<small>{vUnit}</small></span>
						{#if sub}<span class="r-s">{fmt(sub.litres)} L</span>{/if}
					</div>
					<div class="result">
						<span class="r-k">Weight, about</span>
						<span class="r-v buy">{sub ? fmtWeight(sub.kg, u) : '—'}</span>
						{#if sub && data.imperial}<span class="r-s">{fmt(sub.kg)} kg</span>{/if}
					</div>
				</div>
			</section>

			<!-- For later: the chemistry ones, under their own heading (#67) -->
			<div class="group" id="advanced">
				<h2 class="group-h">Advanced</h2>
				<p class="lede">For fertilizer dosing, CO₂ and RO water. Most tanks don’t need these at first.</p>
			</div>

			<!-- 5 · Dose → ppm -->
			<section id="dose" class="sec" aria-labelledby="dose-h">
				<h2 id="dose-h">Dose → ppm</h2>
				<p class="lede">What a dose of a product adds to the water, and the dose for a target. Save a product's strength under <a href="/settings/products">Settings › Products</a> and it's here to pick.</p>
				<div class="field">
					<label class="label" for="d-p">Product</label>
					<select class="input" id="d-p" bind:value={product}>
						{#each data.products as p (p.id)}<option value={p.id}>{p.name}{p.of ? ` · ${p.of}` : ''}</option>{/each}
						<option value="own">Type the strength from the bottle</option>
					</select>
				</div>
				{#if !saved}
					<div class="bottle">
						<span>The bottle says</span>
						<input class="short" inputmode="decimal" bind:value={dDose} aria-label="Dose in mL" />
						<span>mL in</span>
						<input class="short" inputmode="decimal" bind:value={dPer} aria-label="Volume in {vUnit}" />
						<span>{vUnit} adds</span>
						<input class="short" inputmode="decimal" bind:value={dPpm} aria-label="ppm added" />
						<span>ppm</span>
					</div>
				{/if}
				<div class="grid3">
					{@render field('d-vol', 'Tank water', dVolume, (v) => (dVolume = v), vUnit)}
					{@render field('d-amt', 'Dose', dAmount, (v) => (dAmount = v), 'mL')}
					{@render field('d-target', 'Target rise', dTarget, (v) => (dTarget = v), 'ppm')}
				</div>
				<div class="results">
					<div class="result">
						<span class="r-k">{dAmount || '—'} mL adds</span>
						<span class="r-v">{fmt(dosePpm, 2)}<small>ppm{saved?.of ? ` ${saved.of}` : ''}</small></span>
					</div>
					<div class="result">
						<span class="r-k">For +{dTarget || '—'} ppm, dose</span>
						<span class="r-v">{fmt(doseFor, 1)}<small>mL</small></span>
						{#if mgPerMl == null}<span class="r-s">Fill in the strength first.</span>{/if}
					</div>
				</div>
			</section>

			<!-- 6 · CO₂ -->
			<section id="co2" class="sec" aria-labelledby="co2-h">
				<h2 id="co2-h">CO₂ from pH and KH</h2>
				<p class="lede">Dissolved CO₂ from the pH / KH relationship (3 × KH × 10<sup>7 − pH</sup>). Take the pH when the CO₂ has been on a few hours. Planted tanks aim for 20–30 ppm.</p>
				<div class="grid3">
					{@render field('c-ph', 'pH', cPh, (v) => (cPh = v))}
					{@render field('c-kh', 'KH', cKh, (v) => (cKh = v), data.units.kh)}
					{@render field('c-t', 'CO₂ you want', cTarget, (v) => (cTarget = v), 'ppm')}
				</div>
				<div class="results">
					<div class="result">
						<span class="r-k">CO₂ now</span>
						<span class="r-v">{fmt(co2)}<small>ppm</small></span>
						{#if co2 != null}<span class="r-s" class:bad={co2Status(co2).level === 'high'}>{co2Status(co2).text}</span>{/if}
					</div>
					<div class="result">
						<span class="r-k">pH to aim for</span>
						<span class="r-v">{fmt(co2Ph, 2)}</span>
						{#if co2Ph != null}<span class="r-s">at this KH, for {cTarget} ppm</span>{/if}
					</div>
				</div>
			</section>

			<!-- 7 · Remineralize -->
			<section id="remineralize" class="sec" aria-labelledby="rem-h">
				<h2 id="rem-h">GH / KH for RO water</h2>
				<p class="lede">Salts to bring RO/DI water (or rainwater) up to the hardness you want: baking soda for KH, gypsum and Epsom salt for GH, 3 : 1 calcium to magnesium.</p>
				<div class="grid3">
					{@render field('r-vol', 'Water to treat', rVolume, (v) => (rVolume = v), vUnit)}
					{@render field('r-kh', 'KH to reach', rKh, (v) => (rKh = v), data.units.kh)}
					{@render field('r-gh', 'GH to reach', rGh, (v) => (rGh = v), data.units.gh)}
				</div>
				<div class="rows">
					<div class="row"><span>Baking soda (sodium bicarbonate) · for KH</span><b>{rem ? fmtGrams(rem.bakingSodaG) : '—'}</b></div>
					<div class="row"><span>or potassium bicarbonate instead · for KH</span><b>{rem ? fmtGrams(rem.potassiumBicarbonateG) : '—'}</b></div>
					<div class="row"><span>Gypsum (calcium sulfate dihydrate) · for GH</span><b>{rem ? fmtGrams(rem.gypsumG) : '—'}</b></div>
					<div class="row"><span>Epsom salt (magnesium sulfate heptahydrate) · for GH</span><b>{rem ? fmtGrams(rem.epsomSaltG) : '—'}</b></div>
				</div>
				<p class="note">Dissolve each in a little tank water first. A bought remineralizer has its own dose on the tub.</p>
			</section>
		</div>
	</div>
</div>

<style>
	.page {
		padding: 8px 20px 32px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.layout {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.side {
		display: none;
	}
	.chips {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		margin: 0 -20px;
		padding: 0 20px 4px;
		scrollbar-width: none;
	}
	.chips .chip {
		flex-shrink: 0;
		white-space: nowrap;
	}
	.content {
		display: flex;
		flex-direction: column;
		gap: 36px;
		min-width: 0;
	}
	.for {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.for .input {
		flex: 1;
		max-width: 320px;
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: 12px;
		scroll-margin-top: 16px;
	}
	.group-h {
		margin: 0;
		font-size: 13px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.sec {
		display: flex;
		flex-direction: column;
		gap: 14px;
		scroll-margin-top: 16px;
	}
	.sec h2 {
		margin: 0;
		padding-bottom: 8px;
		border-bottom: 2px solid var(--ink);
		font-size: 22px;
		font-weight: 800;
	}
	.lede,
	.note {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
		max-width: 620px;
	}
	.lede a {
		color: var(--accent-text);
	}
	.note {
		font-size: 13px;
		color: var(--text-muted);
	}
	.grid3 {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	.field .input,
	.unit-input {
		min-height: 44px;
	}
	.results {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px 16px;
		padding-top: 4px;
		border-top: 1px solid var(--divider);
		align-items: start;
	}
	.result {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-top: 8px;
	}
	.r-k {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.r-v {
		font-size: 28px;
		font-weight: 800;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
	}
	.r-v small {
		font-size: 11px;
		font-weight: 400;
		color: var(--text-muted);
		margin-left: 4px;
	}
	.r-v.buy {
		font-size: 22px;
	}
	.r-s {
		font-size: 13px;
		color: var(--text-2);
	}
	.r-s.bad,
	.status.bad {
		color: var(--accent-text);
		font-weight: 700;
	}
	.status {
		margin: 8px 0 0;
		grid-column: 1 / -1;
		font-size: 14px;
	}
	.save {
		grid-column: 1 / -1;
		justify-self: start;
		min-height: 44px;
	}
	.other,
	.bottle {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 8px;
		font-size: 14px;
		color: var(--text-2);
	}
	.inline {
		display: contents;
	}
	.short {
		width: 72px;
		min-height: 44px;
		border: 1px solid var(--divider);
		background: var(--bg);
		color: var(--text);
		padding: 0 10px;
		font: inherit;
		font-variant-numeric: tabular-nums;
	}
	.short:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.rows {
		border-top: 1px solid var(--divider);
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		padding: 6px 0;
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
	}
	.row b {
		font-size: 17px;
		font-weight: 800;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	@media (min-width: 1024px) {
		.page {
			padding: 22px 32px 48px;
		}
		.layout {
			display: grid;
			grid-template-columns: 200px minmax(0, 1fr);
			gap: 0;
		}
		.side {
			display: flex;
			flex-direction: column;
			align-self: start;
			position: sticky;
			top: 0;
			padding: 0 16px 32px 0;
			border-right: 2px solid var(--divider);
		}
		.side a {
			display: flex;
			align-items: center;
			height: 40px;
			padding: 0 8px;
			color: var(--text);
			font-size: 14px;
		}
		.side-h {
			margin-top: 16px;
			padding: 8px 8px 4px;
			font-size: 12px;
			font-weight: 800;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--text-muted);
		}
		.side a.adv {
			flex-direction: column;
			align-items: flex-start;
			justify-content: center;
			height: auto;
			min-height: 44px;
			padding: 4px 8px;
		}
		.side a.adv small {
			font-size: 12px;
			color: var(--text-muted);
		}
		@media (hover: hover) {
			.side a:hover {
				background: var(--surface);
			}
		}
		.content {
			max-width: 820px;
			padding-left: 32px;
		}
		.grid3 {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.results {
			grid-template-columns: repeat(2, minmax(0, 260px)) 1fr;
		}
		.save {
			grid-column: auto;
			align-self: end;
			justify-self: end;
		}
		.sec {
			scroll-margin-top: 24px;
		}
	}
</style>
