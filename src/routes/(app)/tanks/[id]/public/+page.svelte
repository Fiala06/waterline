<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { photoUrl } from '$lib/media';
	import { toast } from '$lib/ui.svelte';
	let { data, form } = $props();
	const p = $derived(data.page);

	let enabled = $state(untrack(() => data.page.enabled));
	let slug = $state(untrack(() => data.page.slug));
	let title = $state(untrack(() => data.page.seoTitle ?? ''));
	let description = $state(untrack(() => data.page.seoDescription ?? ''));
	let blurb = $state(untrack(() => data.page.description ?? ''));
	let ogPhotoId = $state(untrack(() => data.page.ogPhotoId ?? ''));
	let copied = $state(false);

	const url = $derived(`${data.base}/t/${slug}`);
	const shownTitle = $derived(title || `${data.tank.name} · aquarium log`);
	const shownDesc = $derived(description || `Water parameters, trends and photos from ${data.tank.name}.`);
	const live = $derived(enabled && p.enabled);

	const toggles = [
		{ k: 'showReadings', t: 'Latest readings', d: 'Values and in-range status' },
		{ k: 'showCharts', t: 'Trend charts', d: 'Last 3 months' },
		{ k: 'showPhotos', t: 'Photos', d: 'Newest 12' },
		{ k: 'showLivestock', t: 'Livestock & plants', d: 'Species and counts; no sources or prices' },
		{ k: 'showPetNames', t: 'Pet names and photos', d: 'Names you gave your pets, and photos tagged with them' },
		{ k: 'showEquipment', t: 'Equipment', d: 'Brands and models; no notes' },
		{ k: 'showActivity', t: 'Activity log', d: 'Water changes, dosing, plants; no notes' },
		{ k: 'showDescription', t: 'Tank description', d: 'A separate public blurb' }
	] as const;

	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* clipboard blocked */
		}
	}
</script>

<svelte:head><title>Public page · {data.tank.name}</title></svelte:head>

<form
	method="POST"
	action="?/save"
	class="page"
	use:enhance={() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') {
				slug = data.page.slug; // as the server cleaned it up
				toast('✓ Public page saved');
			}
		}}
>
	<!-- on desktop the header has "Tanks › {tank} › Public page"; Save stays in a slim toolbar -->
	<a class="back hide-desk" href="/tanks/{data.tank.id}/settings">‹ {data.tank.name}</a>
	<div class="head">
		<h1 class="hide-desk">Public page</h1>
		<span class="head-acts">
			{#if p.enabled}<a class="btn" href="/t/{p.slug}" target="_blank" rel="noopener">Preview page</a>{/if}
			<button class="btn btn-primary">Save</button>
		</span>
	</div>
	{#if !data.allowed}
		<p class="banner banner-warn">▲ The server owner has turned public pages off, so this page can't be published right now.</p>
	{/if}

	<div class="cols">
		<div class="col">
			<section class="box" class:on={live}>
				<div class="trow">
					<label for="pp-enabled" class="ttext">
						<span class="tt">Share this tank</span>
						{#if live}
							<span class="td live">● Live · {data.views} view{data.views === 1 ? '' : 's'} this week</span>
						{:else}
							<span class="td">Off · only you can see this tank</span>
						{/if}
					</label>
					<span class="switch"><input id="pp-enabled" type="checkbox" name="enabled" bind:checked={enabled} /><span></span></span>
				</div>
				<div class="field">
					<label class="label" for="pp-slug">URL</label>
					<div class="unit-input slug">
						<span class="unit mono">{data.host}/t/</span>
						<input id="pp-slug" class="mono" name="slug" bind:value={slug} maxlength="60" autocomplete="off" aria-invalid={!!form?.slugError} />
					</div>
					{#if form?.slugError}<span class="error-text">✕ {form.slugError}</span>{/if}
					<div class="links">
						<button type="button" class="btn" onclick={copy}>{copied ? '✓ Copied' : 'Copy link'}</button>
					</div>
				</div>
			</section>

			<section class="stack">
				<h2 class="kicker rule">Show on the page</h2>
				<div class="toggles">
					{#each toggles as t (t.k)}
						<div class="trow">
							<label for="pp-{t.k}" class="ttext"><span class="tt">{t.t}</span><span class="td">{t.d}</span></label>
							<span class="switch"><input id="pp-{t.k}" type="checkbox" name={t.k} defaultChecked={p[t.k]} /><span></span></span>
						</div>
					{/each}
				</div>
				<div class="field">
					<label class="label" for="pp-blurb">Public description</label>
					<textarea class="input" id="pp-blurb" name="description" rows="3" maxlength="1000" bind:value={blurb} placeholder="What's special about this tank? Shown only if Tank description is on."></textarea>
				</div>
				<div class="field">
					<label class="label" for="pp-name">Display name</label>
					<select class="input" id="pp-name" name="displayName">
						<option value="short" selected={p.displayName === 'short'}>{data.names.short}</option>
						<option value="full" selected={p.displayName === 'full'}>{data.names.full}</option>
						<option value="none" selected={p.displayName === 'none'}>Don't show a name</option>
					</select>
				</div>
				<p class="hint">Never public: tasks, private notes, exact times, your email.</p>
			</section>

			<section class="stack">
				<h2 class="kicker rule">Search &amp; sharing</h2>
				<div class="toggles">
					<div class="trow">
						<label for="pp-index" class="ttext"><span class="tt strong">Allow search engines</span><span class="td">Page is indexable and listed in sitemap.xml</span></label>
						<span class="switch"><input id="pp-index" type="checkbox" name="indexable" defaultChecked={p.indexable} /><span></span></span>
					</div>
				</div>
				<div class="field">
					<label class="label" for="pp-title">Page title <span class="count">{title.length} / 60</span></label>
					<input class="input" id="pp-title" name="seoTitle" bind:value={title} maxlength="60" placeholder={shownTitle} />
				</div>
				<div class="field">
					<label class="label" for="pp-desc">Description <span class="count">{description.length} / 160</span></label>
					<textarea class="input" id="pp-desc" name="seoDescription" rows="3" maxlength="160" bind:value={description} placeholder={shownDesc}></textarea>
				</div>
				<fieldset class="field">
					<legend class="label">Share image</legend>
					<div class="segmented">
						<label><input type="radio" name="ogStyle" value="card" defaultChecked={!p.ogPlain} />Card with readings</label>
						<label><input type="radio" name="ogStyle" value="plain" defaultChecked={p.ogPlain} />Plain photo</label>
					</div>
					{#if data.photos.length}
						<div class="og-photos" role="radiogroup" aria-label="Share photo">
							<label class="og" class:on={ogPhotoId === ''}><input type="radio" name="ogPhotoId" value="" bind:group={ogPhotoId} /><span>Cover</span></label>
							{#each data.photos as ph, i (ph.id)}
								<label class="og" class:on={ogPhotoId === ph.id}>
									<input type="radio" name="ogPhotoId" value={ph.id} bind:group={ogPhotoId} aria-label="Photo {i + 1}" />
									<img src={photoUrl(ph.id)} alt="" loading="lazy" />
								</label>
							{/each}
						</div>
					{:else}
						<span class="hint">Add a cover photo for a nicer share image.</span>
					{/if}
				</fieldset>
			</section>
		</div>

		<!-- P4: previews beside the fields on desktop -->
		<aside class="col previews">
			<section class="stack">
				<h2 class="kicker">Search preview</h2>
				<div class="preview">
					<div class="g-url mono">{data.host} › t › {slug}</div>
					<div class="g-title">{shownTitle}</div>
					<div class="g-desc">{shownDesc}</div>
				</div>
			</section>
			{#if p.enabled}
				<section class="stack">
					<h2 class="kicker">Social preview</h2>
					<div class="preview social">
						<img class="og-img" src="/t/{p.slug}/og.png?v={data.ogVersion}" alt="How the link looks when shared" />
					</div>
				</section>
			{/if}
			<p class="hint">Canonical URL, Open Graph tags and structured data are added automatically.</p>
		</aside>
	</div>
	<button class="btn btn-primary btn-lg save-end">Save</button>
</form>

<style>
	.page {
		padding: 8px 20px 32px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.head h1 {
		flex-basis: 100%;
	}
	.head-acts {
		display: flex;
		gap: 8px;
		margin-left: auto;
	}
	h1 {
		margin: 0;
		font-size: 28px;
	}
	.cols,
	.col {
		display: flex;
		flex-direction: column;
		gap: 20px;
		min-width: 0;
	}
	/* the share box: a 2px border, ink while the page is live */
	.box {
		padding: 14px 16px;
		border: 2px solid var(--divider);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.box.on {
		border-color: var(--ink);
	}
	.live {
		font-weight: 800;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.kicker {
		margin: 0;
	}
	.rule {
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
		margin-bottom: -12px;
	}
	.toggles {
		display: flex;
		flex-direction: column;
	}
	.trow {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 10px 0;
		border-bottom: 1px solid var(--divider);
	}
	.box .trow {
		padding: 0;
		border-bottom: none;
	}
	.ttext {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1px;
		cursor: pointer;
	}
	.tt {
		font-size: 15px;
		font-weight: 600;
	}
	.box .tt {
		font-size: 16px;
		font-weight: 800;
	}
	.td {
		font-size: 12px;
		color: var(--text-muted);
	}
	.td.live {
		color: var(--text);
		font-size: 13px;
	}
	/* 44px to tap */
	.switch input {
		inset: -10px -4px;
	}
	.slug {
		padding-left: 10px;
		gap: 2px;
		background: var(--bg);
	}
	.slug .unit {
		font-size: 13px;
	}
	.slug input {
		font-size: 13px;
		font-weight: 700;
	}
	.links {
		display: flex;
		gap: 8px;
	}
	.count {
		float: right;
		font-size: 12px;
		color: var(--text-muted);
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 6px;
		width: 100%;
	}
	.og-photos {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding: 4px 0;
	}
	.og {
		position: relative;
		width: 72px;
		height: 72px;
		overflow: hidden;
		flex-shrink: 0;
		border: 2px solid transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface);
		font-size: 13px;
		cursor: pointer;
	}
	.og.on {
		border-color: var(--accent);
	}
	.og input {
		position: absolute;
		opacity: 0;
	}
	.og:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.og img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.previews .stack {
		gap: 8px;
	}
	.preview {
		padding: 14px;
		border: 1px solid var(--divider);
		background: var(--bg);
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.social {
		padding: 0;
		overflow: hidden;
	}
	.g-url {
		font-size: 12px;
		color: var(--text-muted);
	}
	.g-title {
		font-size: 17px;
		line-height: 1.25;
		color: var(--accent-700);
	}
	.g-desc {
		font-size: 13px;
		line-height: 1.45;
		color: var(--text-2);
	}
	.og-img {
		display: block;
		width: 100%;
		aspect-ratio: 1200 / 630;
		object-fit: cover;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.save-end {
		height: 52px;
	}
	/* Desktop: beside the shell's Setup nav (its title too), fields | 280px previews */
	@media (min-width: 1024px) {
		.page {
			padding: 24px 32px 48px;
			max-width: 880px;
		}
		.head {
			margin-top: -8px;
		}
		.cols {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 280px;
			gap: 28px;
			align-items: start;
		}
		.previews {
			position: sticky;
			top: 24px;
		}
		.save-end {
			width: auto;
			height: 44px;
			font-size: 14px;
			padding: 0 22px;
			align-self: flex-start;
		}
	}
	@media (min-width: 1024px) and (max-width: 1199px) {
		.cols {
			grid-template-columns: minmax(0, 1fr);
		}
		.previews {
			position: static;
		}
	}
</style>
