<script lang="ts">
	// A heading's own link ("#"), for sharing an address that opens right at
	// it. A plain link to the section without scripts; with them, it also
	// copies the address.
	import { toast } from '$lib/ui.svelte';
	let { id, label }: { id: string; label: string } = $props();

	async function copy() {
		const url = `${location.origin}${location.pathname}#${id}`;
		try {
			await navigator.clipboard.writeText(url);
			toast('✓ Link copied');
		} catch {
			/* the address bar has it */
		}
	}
</script>

<a class="sec-link" href="#{id}" aria-label="Link to this section" title="Copy a link to {label}" onclick={copy}>#</a>

<style>
	.sec-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/* a 44px target that takes the room of a small mark */
		width: 44px;
		height: 44px;
		margin: -10px -8px -10px -4px;
		border-radius: 0;
		font-size: 0.85em;
		font-weight: 600;
		color: var(--text-faint);
		text-decoration: none;
		vertical-align: middle;
	}
	.sec-link:focus-visible,
	.sec-link:hover {
		color: var(--accent);
		background: var(--surface);
	}
	/* where there's a pointer, only beside the heading it's over */
	@media (hover: hover) {
		.sec-link {
			opacity: 0;
		}
		:global(:is(h2, h3):hover) > .sec-link,
		.sec-link:focus-visible {
			opacity: 1;
		}
	}
</style>
