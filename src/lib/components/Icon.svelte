<script lang="ts">
	// The shell's 24px stroke icons (1.8 stroke, square caps), as the design draws them.
	export type Name =
		| 'search'
		| 'bell'
		| 'tasks'
		| 'settings'
		| 'menu'
		| 'pin'
		| 'unpin'
		| 'grid'
		| 'chart'
		| 'clock'
		| 'more'
		| 'plus'
		| 'tanks'
		| 'chevron-right'
		| 'close';
	let { name, size = 20 }: { name: Name; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="square"
	stroke-linejoin="miter"
	aria-hidden="true"
>
	{#if name === 'search'}
		<circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
	{:else if name === 'bell'}
		<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
	{:else if name === 'tasks'}
		<path d="m3 7 2 2 4-4" /><path d="m3 17 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" />
	{:else if name === 'settings'}
		<path
			d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
		/><circle cx="12" cy="12" r="3" />
	{:else if name === 'menu'}
		<path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" />
	{:else if name === 'pin'}
		<rect x="3" y="4" width="18" height="16" /><path d="M9 4v16" /><path d="m15 9-3 3 3 3" />
	{:else if name === 'unpin'}
		<rect x="3" y="4" width="18" height="16" /><path d="M9 4v16" /><path d="m13 9 3 3-3 3" />
	{:else if name === 'grid'}
		<rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
	{:else if name === 'chart'}
		<path d="M3 3v18h18" /><path d="m7 15 4-5 3 3 5-7" />
	{:else if name === 'clock'}
		<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
	{:else if name === 'more'}
		<path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" />
	{:else if name === 'plus'}
		<path d="M12 5v14" /><path d="M5 12h14" />
	{:else if name === 'tanks'}
		<rect x="3" y="5" width="18" height="14" /><path d="M3 10h18" />
	{:else if name === 'chevron-right'}
		<path d="m9 6 6 6-6 6" />
	{:else if name === 'close'}
		<path d="m6 6 12 12" /><path d="m18 6-12 12" />
	{/if}
</svg>
