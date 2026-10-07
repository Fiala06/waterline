<script lang="ts">
	// Worth checking (#95): under a plant symptom or an algae entry, the things
	// a keeper usually looks at, each with what the tank's records say and a
	// link to where to look. Possibilities, never a diagnosis.
	import { CHECKS_NOTE, type Check } from '$lib/symptoms';
	let { title, lead, checks }: { /** "Red stem bunch: pinholes noted." */ title: string; lead: string; checks: Check[] } = $props();
</script>

<section class="checks" aria-label="Worth checking">
	<h3>{title}</h3>
	<p class="lead">{lead}</p>
	<p class="k">Things worth checking</p>
	<ul>
		{#each checks as c, i (i)}
			<li>
				<span>{c.text}</span>
				{#if c.link}<a href={c.link.href}>{c.link.label}</a>{/if}
			</li>
		{/each}
	</ul>
	<p class="note">{CHECKS_NOTE}</p>
</section>

<style>
	.checks {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
		line-height: 1.45;
		color: var(--text-2);
	}
	h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
		color: var(--text);
	}
	.lead,
	.note,
	.k {
		margin: 0;
	}
	.k {
		margin-top: 4px;
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 2px solid var(--ink);
	}
	li {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	li a {
		flex-shrink: 0;
		font-weight: 800;
		color: var(--accent-text);
		white-space: nowrap;
		/* 44px to tap, in a tight list */
		position: relative;
	}
	li a::after {
		content: '';
		position: absolute;
		inset: -12px -8px;
	}
	.note {
		font-size: 12px;
		color: var(--text-muted);
	}
</style>
