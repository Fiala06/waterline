<script lang="ts">
	// "Import from a spreadsheet": a secondary button, under a list or History, or in an empty state.
	let { href, label = 'Import from a spreadsheet', onclick }: { href: string; label?: string; onclick?: () => void } = $props();
</script>

<a class="btn import" {href} {onclick}>
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
		><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></svg
	>{label}
</a>

<style>
	.import {
		align-self: flex-start;
	}
	svg {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--accent);
	}
	@media (hover: hover) {
		.import:hover {
			background: var(--surface-hi);
		}
	}
</style>
