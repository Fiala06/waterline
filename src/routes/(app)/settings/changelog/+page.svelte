<script lang="ts">
	// What's new: every release, newest first, from CHANGELOG.md in the build,
	// so it's here offline and always matches the version running. The newest
	// few are open; older ones fold away by version (1.4, 1.3, …).
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

<svelte:head><title>What's new · Settings · Waterline</title></svelte:head>

<div class="page sub-page">
	<div class="head">
		<a class="back sub-back" href="/settings">‹ Settings</a>
		<h1>What's new</h1>
		<p class="muted">You're on Waterline {displayVersion(VERSION)}. The newest changes come first.</p>
		<a class="repo" href={data.app.repo} target="_blank" rel="noopener noreferrer">Waterline on GitHub<span aria-hidden="true"> ↗</span></a>
	</div>

	{#if update}
		<section class="update" id="update" aria-labelledby="update-h">
			<h2 id="update-h">Waterline {update.version} is out</h2>
			<p>
				Update the Docker image to get it; on Unraid, the Docker tab shows update ready. Everything in /data is kept.
				<a href={update.link} target="_blank" rel="noopener noreferrer">Changelog on GitHub<span aria-hidden="true"> ↗</span></a>
			</p>
			{#each update.releases as r (r.version)}
				<h3>{displayVersion(r.version)} <span class="date">{fmtDateLong(r.date)}</span></h3>
				{@render lines(r, false)}
			{/each}
			{#if update.more}
				<p class="more">
					And {update.more} earlier {update.more === 1 ? 'release' : 'releases'}:
					<a href={update.link} target="_blank" rel="noopener noreferrer">read them on GitHub<span aria-hidden="true"> ↗</span></a>
				</p>
			{/if}
		</section>
	{/if}

	{#each RELEASES.slice(0, OPEN) as r (r.version)}
		<section class="release" aria-labelledby={id(r.version)}>
			<h2 id={id(r.version)}>{displayVersion(r.version)} <span class="date">{fmtDateLong(r.date)}</span></h2>
			{@render lines(r)}
		</section>
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
								<section class="release" aria-labelledby={id(r.version)}>
									<h3 id={id(r.version)}>{displayVersion(r.version)} <span class="date">{fmtDateLong(r.date)}</span></h3>
									{@render lines(r)}
								</section>
							{/each}
						</div>
					</details>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.lines a {
		font-weight: 600;
	}
	.lines a.strong {
		font-weight: 700;
	}
	.page {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 600px;
	}
	.head {
		display: flex;
		flex-direction: column;
	}
	h1 {
		margin: 0 0 4px;
		font-size: 28px;
		font-weight: 600;
	}
	.head p {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
	}
	/* the project's page, always */
	.repo {
		align-self: flex-start;
		min-height: 44px;
		display: flex;
		align-items: center;
		font-size: 14px;
		font-weight: 600;
	}
	.release {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h2,
	h3 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	/* a newer release, for admins: in the accent, above what's installed */
	.update {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		border-radius: 16px;
		background: var(--selected);
		border: 1px solid var(--accent);
	}
	.update h2 {
		color: var(--accent);
	}
	.update p {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
	}
	.update p a {
		font-weight: 600;
		white-space: nowrap;
	}
	.update h3 {
		margin-top: 4px;
		font-size: 15px;
	}
	.update .more {
		font-size: 14px;
	}
	/* older releases, one fold per version line, opened on tap (works without scripts) */
	.earlier {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.folds {
		border-top: 1px solid var(--border);
	}
	details {
		border-bottom: 1px solid var(--border);
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
		font-size: 16px;
		font-weight: 600;
	}
	.fold {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 4px 0 16px;
	}
	.fold h3 {
		font-size: 15px;
	}
	.date {
		font-size: 14px;
		font-weight: 400;
		color: var(--text-muted);
	}
	/* one card, a row per change */
	.lines {
		list-style: none;
		margin: 0;
		padding: 0 14px;
		border-radius: 14px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.lines li {
		padding: 12px 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--text-2);
	}
	.lines li + li {
		border-top: 1px solid var(--divider-soft);
	}
	strong {
		font-weight: 600;
		color: var(--text);
	}
	@media (min-width: 1024px) {
		.lines {
			max-width: 720px;
		}
	}
</style>
