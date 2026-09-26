<script lang="ts">
	// Mark 2c ("inset water"); below 24px use 2a (solid).
	let { size = 28, wordmark = false, wordSize }: { size?: number; wordmark?: boolean; wordSize?: number } =
		$props();
	const uid = $props.id();
	const small = $derived(size < 24);
</script>

<span class="logo" style:gap="{size * 0.27}px">
	<svg width={size} height={size} viewBox="0 0 56 56" aria-hidden={wordmark} role="img" aria-label="Waterline">
		<defs>
			<clipPath id="wl-{uid}">
				<circle cx="28" cy="28" r={small ? 24 : 19}></circle>
			</clipPath>
		</defs>
		<rect x="0" y={small ? 32 : 31} width="56" height="30" fill="var(--accent)" clip-path="url(#wl-{uid})"></rect>
		<circle cx="28" cy="28" r={small ? 24 : 24.5} fill="none" stroke="var(--text)" stroke-width={size >= 64 ? 3 : 4}
		></circle>
	</svg>
	{#if wordmark}
		<span class="word" style:font-size="{wordSize ?? size * 0.68}px">Waterline</span>
	{/if}
</span>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
	}
	svg {
		flex-shrink: 0;
		display: block;
	}
	.word {
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--text);
	}
</style>
