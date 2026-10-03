<script lang="ts">
	// Once after an update, on the dashboard: what's new since the version last
	// seen, until Got it or See what's new (both remember it, and work without
	// scripts). Each item links to its feature when its changelog line has a link.
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Logo from './Logo.svelte';
	let {
		version,
		since,
		leads,
		more
	}: {
		version: string;
		/** the version last seen, when more than one release is new */
		since: string | null;
		leads: { text: string; href: string | null }[];
		more: number;
	} = $props();
	let gone = $state(false);
</script>

{#if !gone}
	<section class="whats-new" aria-labelledby="whats-new-h">
		<div class="top">
			<span class="icon" aria-hidden="true"><Logo size={30} /></span>
			<div class="text">
				<h2 id="whats-new-h">{since ? `What's new since ${since}` : `What's new in ${version}`}</h2>
				<ul>
					{#each leads as l, i (i)}<li>{#if l.href && !l.href.startsWith('https://')}<a href={l.href}>{l.text}</a>{:else}{l.text}{/if}</li>{/each}
				</ul>
				{#if more}<p class="more">and {more} more</p>{/if}
			</div>
		</div>
		<form
			method="POST"
			action="/settings/changelog?/seen"
			class="actions"
			use:enhance={() => {
				gone = true;
				return async ({ update }) => update();
			}}
		>
			<button class="btn" name="to" value={page.url.pathname + page.url.search}>Got it</button>
			<button class="btn btn-primary" name="to" value="/settings/changelog">See what's new</button>
		</form>
	</section>
{/if}

<style>
	/* a 2px ink border, as the design's notice boxes */
	.whats-new {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		border: 2px solid var(--ink);
	}
	.top {
		display: flex;
		align-items: flex-start;
		gap: 14px;
	}
	.icon {
		width: 48px;
		height: 48px;
		flex-shrink: 0;
		background: var(--surface);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.text {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
	}
	ul {
		margin: 0;
		padding-left: 18px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
	}
	.more {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	.actions {
		display: flex;
		gap: 8px;
	}
	.actions .btn {
		flex: 1;
	}

	/* desktop: one row, the buttons at the end */
	@media (min-width: 1024px) {
		.whats-new {
			flex-direction: row;
			align-items: center;
			gap: 20px;
			padding: 16px 20px;
		}
		.top {
			flex: 1;
			align-items: center;
		}
		.actions .btn {
			flex: none;
			padding: 0 18px;
		}
	}
</style>
