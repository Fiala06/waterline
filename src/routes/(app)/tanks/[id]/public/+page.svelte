<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { photoUrl } from '$lib/media';
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

	const toggles = [
		{ k: 'showReadings', t: 'Latest readings', d: 'Values and in-range status' },
		{ k: 'showCharts', t: 'Trend charts', d: 'Last 3 months' },
		{ k: 'showPhotos', t: 'Photos', d: 'Newest 12' },
		{ k: 'showLivestock', t: 'Livestock & plants', d: 'Species and counts; no sources or prices' },
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

<form method="POST" action="?/save" class="page" use:enhance={() => async ({ update }) => update({ reset: false })}>
	<a class="back" href="/tanks/{data.tank.id}/settings">‹ {data.tank.name}</a>
	<div class="head">
		<h1>Public page</h1>
		<button class="btn btn-primary">Save</button>
	</div>
	{#if !data.allowed}
		<p class="banner banner-bad">The server owner has turned public pages off, so this page can't be published right now.</p>
	{/if}
	{#if form?.saved}<p class="banner banner-ok" role="status">✓ Saved</p>{/if}

	<section class="card box">
		<div class="trow">
			<label for="pp-enabled" class="ttext">
				<span class="tt">Share this tank</span>
				<span class="td">
					{#if enabled && p.enabled}<span class="status-ok">● Live</span> · {data.views} view{data.views === 1 ? '' : 's'} this week{:else}Off — only you can see this tank{/if}
				</span>
			</label>
			<span class="switch"><input id="pp-enabled" type="checkbox" name="enabled" bind:checked={enabled} /><span></span></span>
		</div>
		<div class="field">
			<label class="label" for="pp-slug">Link</label>
			<div class="unit-input slug">
				<span class="unit mono">{data.host}/t/</span>
				<input id="pp-slug" name="slug" bind:value={slug} maxlength="60" autocomplete="off" aria-invalid={!!form?.slugError} />
			</div>
			{#if form?.slugError}<span class="error-text">✕ {form.slugError}</span>{/if}
			<div class="links">
				<button type="button" class="btn" onclick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
				{#if p.enabled}<a class="btn" href="/t/{p.slug}" target="_blank" rel="noopener">Preview</a>{/if}
			</div>
		</div>
	</section>

	<section class="stack">
		<h2 class="caps">Show on the page</h2>
		<div class="card toggles">
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
		<h2 class="caps">Search & sharing</h2>
		<div class="card toggles">
			<div class="trow">
				<label for="pp-index" class="ttext"><span class="tt">Allow search engines</span><span class="td">Page is indexable and listed in sitemap.xml</span></label>
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
					{#each data.photos as ph (ph.id)}
						<label class="og" class:on={ogPhotoId === ph.id}>
							<input type="radio" name="ogPhotoId" value={ph.id} bind:group={ogPhotoId} />
							<img src={photoUrl(ph.id)} alt="" loading="lazy" />
						</label>
					{/each}
				</div>
			{:else}
				<span class="hint">Add a cover photo for a nicer share image.</span>
			{/if}
		</fieldset>

		<div class="card preview">
			<div class="caps">Search preview</div>
			<div class="g-url mono">{data.host} › t › {slug}</div>
			<div class="g-title">{shownTitle}</div>
			<div class="g-desc">{shownDesc}</div>
		</div>
		{#if p.enabled}
			<div class="card preview">
				<div class="caps">Social preview</div>
				<img class="og-img" src="/t/{p.slug}/og.png?v={Date.now()}" alt="How the link looks when shared" />
			</div>
		{/if}
		<p class="hint">
			Added automatically: canonical URL, Open Graph and Twitter tags, schema.org structured data, and a server-rendered page, so
			crawlers see full content without JavaScript.
		</p>
	</section>
	<button class="btn btn-primary btn-lg">Save</button>
</form>

<style>
	.page {
		padding: 8px 20px 32px;
		display: flex;
		flex-direction: column;
		gap: 18px;
		max-width: 640px;
	}
	.back {
		font-size: 16px;
		font-weight: 600;
		min-height: 36px;
		display: flex;
		align-items: center;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	.box {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.caps {
		margin: 0;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.toggles {
		display: flex;
		flex-direction: column;
	}
	.trow {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
	}
	.box .trow {
		padding: 0;
	}
	.trow + .trow {
		border-top: 1px solid var(--border);
	}
	.ttext {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		cursor: pointer;
	}
	.tt {
		font-size: 16px;
		font-weight: 600;
	}
	.td {
		font-size: 13px;
		color: var(--text-muted);
	}
	.slug {
		padding-left: 12px;
	}
	.slug .unit {
		font-size: 14px;
	}
	.links {
		display: flex;
		gap: 8px;
	}
	.count {
		float: right;
		font-size: 12px;
		color: var(--text-faint);
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 8px;
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
		border-radius: 10px;
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
	.og img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.preview {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.g-url {
		font-size: 12px;
		color: var(--text-muted);
	}
	.g-title {
		font-size: 18px;
		color: var(--accent);
	}
	.g-desc {
		font-size: 14px;
		color: var(--text-2);
	}
	.og-img {
		width: 100%;
		border-radius: 10px;
		aspect-ratio: 1200 / 630;
		object-fit: cover;
		margin-top: 6px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
		line-height: 1.5;
	}
	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
		}
	}
</style>
