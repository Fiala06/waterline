<script lang="ts">
	// Neutral category icons (accent on `selected`), so color only ever means status.
	// 24×24 line icons, 1.8 stroke, round caps/joins. Paths match design 7.7.
	export type Kind =
		| 'test'
		| 'water_change'
		| 'dosing'
		| 'maintenance'
		| 'livestock'
		| 'plant'
		| 'equipment'
		| 'observation'
		| 'note'
		| 'import';
	let { kind, size = 40, inverted = false }: { kind: Kind; size?: number; inverted?: boolean } = $props();
	const glyph = $derived(Math.round(size * 0.55));
</script>

<span
	class="icon"
	class:inverted
	style:width="{size}px"
	style:height="{size}px"
	style:border-radius="{Math.round(size * 0.3)}px"
	aria-hidden="true"
>
	<svg
		width={glyph}
		height={glyph}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		{#if kind === 'test'}
			<path d="M14.5 2v17.5a2.5 2.5 0 0 1-5 0V2" /><path d="M8.5 2h7" /><path d="M9.5 14h5" />
		{:else if kind === 'water_change'}
			<path d="M12 2.5s-6.5 7-6.5 11.5a6.5 6.5 0 0 0 13 0C18.5 9.5 12 2.5 12 2.5Z" /><path d="M8.8 15c1.1.8 2.1.8 3.2 0s2.1-.8 3.2 0" />
		{:else if kind === 'dosing'}
			<path d="m2 22 1-1h3l9-9" /><path d="M3 21v-3l9-9" /><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
		{:else if kind === 'maintenance'}
			<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
		{:else if kind === 'livestock'}
			<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z" /><path d="M18 12v.5" /><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86" /><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33" />
		{:else if kind === 'plant'}
			<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
		{:else if kind === 'equipment'}
			<path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
		{:else if kind === 'import'}
			<rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" />
		{:else if kind === 'observation'}
			<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" /><circle cx="12" cy="12" r="3" />
		{:else}
			<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" />
		{/if}
	</svg>
</span>

<style>
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--selected);
		color: var(--accent);
		flex-shrink: 0;
	}
	.icon.inverted {
		background: var(--on-accent);
	}
	svg {
		display: block;
	}
</style>
