<script lang="ts">
	// What's new (redesign README § 15): every release, newest first, from
	// CHANGELOG.md in the build, so it's here offline and always matches the
	// version running. A newer release, for admins, sits at the top with Update now.
	import { byLine, displayVersion, RELEASES, VERSION, type Release } from '$lib/changelog';
	import { fmtDateLong } from '$lib/time';
	let { data } = $props();

	const id = (v: string) => `v${v.replaceAll('.', '-')}`;
	const OPEN = 3;
	const earlier = byLine(RELEASES.slice(OPEN));
	/** "Sep 27, 2026", or "Sep 26, 2026 to Sep 27, 2026" for a line released over days */
	const span = (rs: Release[]) => {
		const [newest, oldest] = [fmtDateLong(rs[0].date), fmtDateLong(rs.at(-1)!.date)];
		return newest === oldest ? newest : `${oldest} to ${newest}`;
	};
	// a newer release on GitHub, for admins (the layout checks)
	const update = $derived(data.app.update);
</script>

<!-- links: off for a release that isn't installed yet, whose pages aren't here -->
{#snippet lines(r: Release, links = true)}
	<ul class="lines">
		{#each r.lines as l, i (i)}
			<li>
				{#each l.parts as p, j (j)}{#if p.href && links}{@const external = p.href.startsWith('https://')}<a
							href={p.href}
							class:strong={p.strong}
							target={external ? '_blank' : undefined}
							rel={external ? 'noopener noreferrer' : undefined}
							>{p.text}{#if external}<span aria-hidden="true"> ↗</span>{/if}</a
						>{:else if p.strong}<strong>{p.text}</strong>{:else}{p.text}{/if}{/each}
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet release(r: Release, current: boolean, links = true, tag: 'h2' | 'h3' = 'h2')}
	<section class="release" class:current aria-labelledby={id(r.version)}>
		<div class="rv">
			<svelte:element this={tag} id={id(r.version)} class="ver">{displayVersion(r.version)}</svelte:element>
			<span class="date">{fmtDateLong(r.date)}</span>
			{#if current}<span class="tag tag-accent here">You're on this</span>{/if}
		</div>
		{@render lines(r, links)}
	</section>
{/snippet}

<svelte:head><title>What's new · Settings · Waterline</title></svelte:head>

<div class="page sub-page">
	<div class="head">
		<a class="back sub-back" href="/settings">‹ Settings</a>
		<h1>What's new</h1>
		<p class="lede">
			The newest changes come first. You're on <span class="mono">Waterline {displayVersion(VERSION)}</span> ·
			<a class="repo" href={data.app.repo} target="_blank" rel="noopener noreferrer">Waterline on GitHub<span aria-hidden="true"> ↗</span></a>
		</p>
	</div>

	{#if update}
		<div class="update" id="update" role="status">
			<span class="upd-text"><b>{update.version} is available.</b> You're on {displayVersion(VERSION)}. Update the Docker image to get it (on Unraid, the Docker tab shows update ready); everything in /data is kept.</span>
			<a class="btn btn-primary" href={update.link} target="_blank" rel="noopener noreferrer">Update now<span aria-hidden="true"> ↗</span></a>
		</div>
		{#each update.releases as r (r.version)}
			{@render release(r, false, false)}
		{/each}
		{#if update.more}
			<p class="more">
				And {update.more} earlier {update.more === 1 ? 'release' : 'releases'}:
				<a href={update.link} target="_blank" rel="noopener noreferrer">read them on GitHub<span aria-hidden="true"> ↗</span></a>
			</p>
		{/if}
	{/if}

	{#each RELEASES.slice(0, OPEN) as r (r.version)}
		{@render release(r, r.version === VERSION)}
	{/each}

	{#if earlier.length}
		<section class="earlier" aria-labelledby="earlier-h">
			<h2 id="earlier-h">Earlier releases</h2>
			<div class="folds">
				{#each earlier as g (g.line)}
					<details>
						<summary>
							<span class="line">{g.line}</span>
							<span class="date"
								>{g.releases.length === 1 ? span(g.releases) : `${g.releases.length} releases · ${span(g.releases)}`}</span
							>
						</summary>
						<div class="fold">
							{#each g.releases as r (r.version)}
								{@render release(r, r.version === VERSION, true, 'h3')}
							{/each}
						</div>
					</details>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.page {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 0;
		max-width: 820px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 18px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
	}
	.lede {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
	}
	.repo {
		font-weight: 800;
	}
	/* a newer release, for admins: a surface box with Update now */
	.update {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 14px;
		padding: 12px 16px;
		margin-bottom: 18px;
		background: var(--surface);
		font-size: 14px;
		line-height: 1.5;
	}
	.upd-text {
		flex: 1;
		min-width: 240px;
	}
	.more {
		margin: 0 0 18px;
		font-size: 14px;
	}
	/* one release: version and date on the left, its changes on the right, under a rule */
	.release {
		display: grid;
		grid-template-columns: 150px minmax(0, 1fr);
		gap: 20px;
		padding: 16px 0;
		border-top: 2px solid var(--divider);
	}
	.release.current {
		border-top-color: var(--ink);
	}
	.rv {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.ver {
		margin: 0;
		font-size: 20px;
	}
	.date {
		font-size: 13px;
		color: var(--text-muted);
	}
	.here {
		align-self: flex-start;
		font-weight: 800;
	}
	.lines {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 14px;
		line-height: 1.45;
	}
	.lines a {
		font-weight: 700;
	}
	strong {
		font-weight: 800;
	}
	/* older releases, one fold per version line, opened on tap (works without scripts) */
	.earlier {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 16px;
		border-top: 2px solid var(--divider);
	}
	.earlier h2 {
		margin: 0;
		font-size: 20px;
	}
	details {
		border-bottom: 1px solid var(--divider);
	}
	summary {
		min-height: 48px;
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary::after {
		content: '';
		flex-shrink: 0;
		margin-left: auto;
		width: 8px;
		height: 8px;
		border-right: 2px solid var(--text-muted);
		border-bottom: 2px solid var(--text-muted);
		transform: rotate(45deg) translate(-2px, -2px);
		transition: transform 0.15s;
	}
	details[open] summary::after {
		transform: rotate(-135deg) translate(-2px, -2px);
	}
	.line {
		font-size: 15px;
		font-weight: 800;
	}
	.fold {
		display: flex;
		flex-direction: column;
		padding-bottom: 8px;
	}
	.fold .release {
		border-top-color: var(--divider-soft);
	}
	@media (max-width: 1023px) {
		.release {
			grid-template-columns: 1fr;
			gap: 10px;
		}
		.rv {
			flex-direction: row;
			align-items: baseline;
			flex-wrap: wrap;
			gap: 4px 10px;
		}
	}
	@media (min-width: 1024px) {
		h1 {
			font-size: 22px;
		}
	}
</style>
