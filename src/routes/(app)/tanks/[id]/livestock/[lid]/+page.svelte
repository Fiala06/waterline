<script lang="ts">
	// A pet's page ("Captain · Betta"), or a species' group: its photo, name,
	// where it came from, notes and History. Naming one of a group moves it out onto its own page.
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onMount } from 'svelte';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import { photoUrl, shrinkImage } from '$lib/media';

	let { data, form } = $props();
	const a = $derived(data.animal);
	const list = $derived(`/tanks/${data.tank.id}/livestock`);
	const here = $derived(`/tanks/${data.tank.id}/livestock/${a.id}`);
	const logHealth = $derived(`/tanks/${data.tank.id}/health?livestock=${a.id}&from=${encodeURIComponent(here)}`);
	const KIND: Record<string, string> = { fish: 'Fish', invert: 'Invert', coral: 'Coral' };
	const title = $derived(a.nickname ?? a.commonName);
	const one = $derived(a.count === 1 || !!a.nickname);
	const gone = $derived(!!a.left);

	let busy = $state(false);
	let ready = $state(false);
	onMount(() => (ready = true));
	const saving: SubmitFunction = () => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	};

	// choosing a photo saves it (without scripts: choose, then Save photo)
	let photoInput = $state<HTMLInputElement>();
	async function chosePhoto() {
		const file = photoInput?.files?.[0];
		if (!photoInput || !file) return;
		const small = await shrinkImage(file, 2560);
		if (small !== file) {
			const dt = new DataTransfer();
			dt.items.add(small);
			photoInput.files = dt.files;
		}
		photoInput.form?.requestSubmit();
	}
	// "−1 Corydoras · loss": the part after the first " · " is muted
	function split(t: string) {
		const i = t.indexOf(' · ');
		return i < 0 ? [t, ''] : [t.slice(0, i), t.slice(i + 3)];
	}
</script>

<svelte:head><title>{a.nickname ? `${a.nickname} · ${a.commonName}` : a.commonName} · {data.tank.name}</title></svelte:head>

<div class="pet">
	<!-- phones; on desktop the header has the title -->
	<div class="bar hide-desk">
		<a class="back" href={list}>‹ All livestock</a>
	</div>

	<div class="hero">
		<div class="who">
			<p class="facts kicker">
				<span>{KIND[a.kind]}</span>
				{#if a.added}<span>· added {a.added}</span>{/if}
				{#if gone}<span>· left {a.left}</span>{/if}
			</p>
			<h1>{title}{#if !one}<span class="count">{' ×' + a.count}</span>{/if}</h1>
			<p class="species">
				{#if a.nickname}{a.commonName}{/if}{#if a.nickname && a.scientificName}{' · '}{/if}{#if a.scientificName}<i>{a.scientificName}</i>{/if}
			</p>
		</div>
		<div class="state">
			{#if gone}<span class="tag tag-neutral">Left {a.left}</span>
			{:else if a.status === 'quarantine'}<span class="tag tag-neutral strong">▲ Quarantine</span>
			{:else}<span class="in-tank">✓ In tank</span>{/if}
			{#if data.underTreatment}<span class="tag tag-neutral strong">▲ Under treatment</span>{/if}
		</div>
	</div>

	<div class="cols">
		<div class="main">
			{#if a.photoId}
				<a class="pic" href="/photos/{a.photoId}" aria-label="Profile photo of {title}"><img src={photoUrl(a.photoId)} alt="" /></a>
			{:else if data.stock}
				<span class="pic"><img src={data.stock.large} alt="" /></span>
			{:else}
				<span class="pic none photo-placeholder" aria-hidden="true"><CategoryIcon kind="livestock" size={40} /></span>
			{/if}
			{#if data.stock?.credit}
				{@const c = data.stock.credit}
				<p class="credit">
					Species photo: {c.author} · {#if c.licenseUrl}<a href={c.licenseUrl} target="_blank" rel="noopener noreferrer">{c.license}</a>{:else}{c.license}{/if} ·
					<a href={c.pageUrl} target="_blank" rel="noopener noreferrer">Wikimedia Commons<span aria-hidden="true"> ↗</span></a>
				</p>
			{/if}

			{#if !gone}
				<div class="photo-acts">
					<form method="POST" action="?/photo" enctype="multipart/form-data" use:enhance={saving}>
						<input bind:this={photoInput} id="pet-photo" class="sr-only" type="file" name="photo" accept="image/*" aria-label="Choose a photo" onchange={chosePhoto} />
						<label class="btn" for="pet-photo" aria-disabled={busy}>{busy ? 'Saving…' : a.photoId ? 'Change photo' : '+ Add your photo'}</label>
						{#if !ready}<button class="btn btn-primary">Save photo</button>{/if}
					</form>
					{#if a.photoId}
						<form method="POST" action="?/removePhoto" use:enhance={saving}><button class="btn-text" disabled={busy}>Remove photo</button></form>
					{/if}
				</div>
				{#if form?.photoError}<p class="error-text" role="alert">✕ {form.photoError}</p>{/if}
			{/if}

			{#if data.care}
				<section class="care" aria-labelledby="care-h">
					<h2 id="care-h" class="care-h">Care</h2>
					{#if data.care.line}<p class="care-line">{data.care.line}</p>{/if}
					{#each data.care.warnings as w (w)}<p class="care-warn">{w}</p>{/each}
					{#if data.care.source}
						<p class="care-src">
							Ranges from <a href={data.care.source.url} target="_blank" rel="noopener noreferrer">{data.care.source.name}</a>{data.care.fb && data.care.fb !== a.commonName ? ` (as ${data.care.fb})` : ''} · <a href={data.care.source.licenseUrl} target="_blank" rel="noopener noreferrer">{data.care.source.license}</a>
						</p>
					{/if}
				</section>
			{/if}

			{#if !gone && !one}
				<form class="name-one" method="POST" action="?/nameOne" use:enhance={saving}>
					<label class="label" for="name-one">Name one of them</label>
					<div class="inline">
						<input class="input" id="name-one" name="nickname" maxlength="60" autocomplete="off" placeholder="Pepper" aria-invalid={!!form?.nameError} />
						<button class="btn btn-primary" disabled={busy}>Name</button>
					</div>
					{#if form?.nameError}<p class="error-text" role="alert">✕ {form.nameError}</p>{/if}
					<p class="hint">Takes one of your {a.count} {a.commonName} into its own entry, with its own photo, notes and history.</p>
				</form>
			{/if}

			<form class="details" method="POST" action="?/save" use:enhance={saving}>
				{#if one && !gone}
					<div class="field">
						<label class="label" for="nickname">Name</label>
						<input class="input" id="nickname" name="nickname" maxlength="60" autocomplete="off" defaultValue={a.nickname ?? ''} placeholder="Give it a name" />
					</div>
				{/if}
				<div class="field">
					<label class="label" for="source">Source · optional</label>
					<input class="input" id="source" name="source" maxlength="120" autocomplete="off" defaultValue={a.source ?? ''} placeholder="Store, breeder, price" />
				</div>
				<div class="field">
					<label class="label" for="notes">Notes</label>
					<textarea class="input" id="notes" name="notes" rows="3" maxlength="4000" defaultValue={a.notes} placeholder="Personality, favourite food, where it hides"></textarea>
				</div>
				<div class="foot"><button class="btn btn-primary" disabled={busy}>Save</button></div>
			</form>

			{#if data.photos.length || a.nickname}
				<section class="gallery" aria-labelledby="photos-h">
					<h2 id="photos-h" class="kicker rule">Photos{data.photos.length ? ` · ${data.photos.length}` : ''}</h2>
					{#if data.photos.length}
						<ul>
							{#each data.photos as id (id)}
								<li><a href="/photos/{id}"><img src={photoUrl(id)} alt="Photo of {title}" loading="lazy" /></a></li>
							{/each}
						</ul>
					{:else}
						<p class="none">Tag {title} in a photo from Photos: open one and choose {title} under In this photo.</p>
					{/if}
				</section>
			{/if}
		</div>

		<aside class="side">
			<section class="history" aria-labelledby="health-h">
				<div class="rule-row">
					<h2 id="health-h" class="kicker rule">Health</h2>
					{#if !gone}<a class="btn-text log-health" href={logHealth}>Log health</a>{/if}
				</div>
				{#if data.health.length}
					<ul class="timeline">
						{#each data.health as h (h.id)}
							<li>
								<a href="/entries/event/{h.id}">
									<span class="h-top"><b class:open={h.open}>{h.outcome}</b><span class="d">{h.day}</span></span>
									{#if h.symptoms.length}
										<span class="h-tags">{#each h.symptoms as s (s)}<span class="tag tag-neutral">{s}</span>{/each}</span>
									{/if}
									{#if h.treatment}<span class="h-line">Treatment: {h.treatment}</span>{/if}
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="none">Nothing logged yet</p>
				{/if}
			</section>
			<section class="history" aria-labelledby="history-h">
				<h2 id="history-h" class="kicker rule">Count history</h2>
				{#if data.history.length}
					<ul>
						{#each data.history as h (h.id)}
							{@const [what, detail] = split(h.title)}
							<li>
								<a href="/entries/event/{h.id}">
									<span class="t"><b>{what}</b>{#if detail}<span class="muted">{' · ' + detail}</span>{/if}</span>
									<span class="d">{h.day}</span>
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="none">Nothing logged yet</p>
				{/if}
			</section>
			{#if a.source}
				<section class="source">
					<span class="kicker">Source</span>
					<span>{a.source}</span>
				</section>
			{/if}
		</aside>
	</div>
</div>

<style>
	.pet {
		padding: 0 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.bar {
		padding: 8px 0 0;
	}
	.back {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		font-size: 14px;
		font-weight: 800;
		color: var(--accent-text);
	}
	/* kicker · name 32/800 · scientific, over a 2px rule, the status on the right */
	.hero {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px 20px;
		padding-bottom: 14px;
		border-bottom: 2px solid var(--divider);
	}
	.who {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.facts {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0 4px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		overflow-wrap: anywhere;
	}
	.count {
		font-weight: 600;
		color: var(--text-muted);
	}
	.species {
		margin: 0;
		font-size: 15px;
		color: var(--text-muted);
	}
	.species:empty {
		display: none;
	}
	.state {
		font-size: 13px;
	}
	.in-tank {
		font-weight: 800;
		color: var(--text-muted);
	}
	.strong {
		font-weight: 800;
	}
	.cols,
	.main,
	.side {
		display: flex;
		flex-direction: column;
		gap: 20px;
		min-width: 0;
	}
	.pic {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 220px;
		overflow: hidden;
		background: var(--surface);
	}
	.pic img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.pic.none {
		color: var(--text-muted);
	}
	/* the credit a species photo needs */
	.credit {
		margin: -12px 0 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.credit a {
		color: var(--text-2);
		text-decoration: underline;
	}
	.photo-acts {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.photo-acts form {
		display: flex;
		gap: 8px;
	}
	.photo-acts label.btn {
		cursor: pointer;
	}
	.photo-acts input:focus-visible + label {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.error-text {
		margin: -8px 0 0;
	}
	.name-one {
		padding: 14px 16px;
		border: 2px solid var(--ink);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.name-one .error-text {
		margin: 0;
	}
	.inline {
		display: flex;
		gap: 8px;
	}
	.inline .input {
		flex: 1;
		min-width: 0;
	}
	.inline .btn {
		height: auto;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.details {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.foot {
		display: flex;
		justify-content: flex-end;
	}
	.foot .btn {
		min-width: 120px;
	}
	.rule {
		margin: 0;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
	}
	.gallery,
	.history {
		display: flex;
		flex-direction: column;
	}
	.gallery ul {
		margin: 8px 0 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: 6px;
	}
	.gallery a {
		display: block;
		aspect-ratio: 1;
		overflow: hidden;
		background: var(--surface);
	}
	.gallery img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.history ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.history a {
		padding: 9px 0;
		display: flex;
		justify-content: space-between;
		gap: 10px;
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
		color: var(--text);
	}
	.history .t {
		min-width: 0;
	}
	.history .t b {
		font-weight: 600;
	}
	.history .d {
		flex-shrink: 0;
		white-space: nowrap;
		color: var(--text-muted);
	}
	/* Health: the heading rule with Log health on the right, then entries */
	.rule-row {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 10px;
		border-bottom: 2px solid var(--ink);
	}
	.rule-row .rule {
		border-bottom: none;
		flex: 1;
	}
	.log-health {
		min-height: 36px;
		margin-bottom: 2px;
		font-size: 13px;
	}
	.timeline {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.timeline a {
		padding: 9px 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
		color: var(--text);
	}
	.h-top {
		display: flex;
		justify-content: space-between;
		gap: 10px;
	}
	.h-top b {
		font-weight: 600;
	}
	.h-top b.open {
		font-weight: 800;
	}
	.h-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.h-line {
		font-size: 13px;
		color: var(--text-muted);
	}
	.source {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-top: 10px;
		border-top: 2px solid var(--ink);
		font-size: 14px;
	}
	.none {
		margin: 0;
		padding: 10px 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	@media (hover: hover) {
		.history a:hover b,
		.timeline a:hover b {
			color: var(--accent-text);
		}
	}
	/* Desktop: `minmax(0,1fr) 300px` under the shell's title */
	@media (min-width: 1024px) {
		.pet {
			padding: 20px 32px 48px;
		}
		h1 {
			font-size: 32px;
		}
		.cols {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 300px;
			gap: 32px;
			align-items: start;
		}
		.main {
			gap: 22px;
		}
		.side {
			gap: 24px;
		}
		.pic {
			height: 300px;
		}
	}
	/* care (#20) */
	.care {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 10px 12px;
		border-left: 2px solid var(--ink);
		background: var(--surface);
	}
	.care-h {
		margin: 0;
		font-size: 12px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.care p {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
	}
	.care-warn {
		font-weight: 700;
	}
	.care-src {
		color: var(--text-muted);
		font-size: 12px !important;
	}
	.care-src a {
		color: inherit;
		text-decoration: underline;
	}
</style>
