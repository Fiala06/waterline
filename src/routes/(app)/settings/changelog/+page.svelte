<script lang="ts">
	// What's new: every release, newest first, from CHANGELOG.md in the build,
	// so it's here offline and always matches the version running.
	import { displayVersion, RELEASES, VERSION, type Release } from '$lib/changelog';
	import { fmtDateLong } from '$lib/time';
	let { data } = $props();

	const id = (v: string) => `v${v.replaceAll('.', '-')}`;
	// a newer release on GitHub, for admins (the layout checks)
	const update = $derived(data.app.update);
</script>

{#snippet lines(r: Release)}
	<ul class="lines">
		{#each r.lines as l, i (i)}
			<li>{#each l.parts as p, j (j)}{#if p.strong}<strong>{p.text}</strong>{:else}{p.text}{/if}{/each}</li>
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
				{@render lines(r)}
			{/each}
		</section>
	{/if}

	{#each RELEASES as r (r.version)}
		<section class="release" aria-labelledby={id(r.version)}>
			<h2 id={id(r.version)}>{displayVersion(r.version)} <span class="date">{fmtDateLong(r.date)}</span></h2>
			{@render lines(r)}
		</section>
	{/each}
</div>

<style>
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
