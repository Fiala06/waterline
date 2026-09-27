<script lang="ts">
	// Mark 2c ("inset water"); below 24px use 2a (solid). With `fish`, a small
	// fish swims through the water every so often (IDEAS): now and then, never
	// constant, and not at all with reduced motion.
	import { onMount } from 'svelte';
	let {
		size = 28,
		wordmark = false,
		wordSize,
		fish = false
	}: { size?: number; wordmark?: boolean; wordSize?: number; fish?: boolean } = $props();
	const uid = $props.id();
	const small = $derived(size < 24);

	let swim = $state<'right' | 'left' | null>(null);
	onMount(() => {
		if (!fish || small) return;
		const still = matchMedia('(prefers-reduced-motion: reduce)');
		let next: 'right' | 'left' = 'right';
		let timer: ReturnType<typeof setTimeout>;
		const later = (ms: number) => (timer = setTimeout(go, ms));
		function go() {
			if (!still.matches && document.visibilityState === 'visible') {
				swim = next;
				next = next === 'right' ? 'left' : 'right';
			}
			later(45_000 + Math.random() * 75_000);
		}
		// the first one soon after the page opens, then once every minute or two
		later(6_000 + Math.random() * 6_000);
		return () => clearTimeout(timer);
	});
</script>

<span class="logo" style:gap="{size * 0.27}px">
	<svg width={size} height={size} viewBox="0 0 56 56" aria-hidden={wordmark} role="img" aria-label="Waterline">
		<defs>
			<clipPath id="wl-{uid}">
				<circle cx="28" cy="28" r={small ? 24 : 19}></circle>
			</clipPath>
		</defs>
		<rect x="0" y={small ? 32 : 31} width="56" height="30" fill="var(--accent)" clip-path="url(#wl-{uid})"></rect>
		{#if fish && !small}
			<g clip-path="url(#wl-{uid})" aria-hidden="true">
				<g
					class="fish {swim ?? ''}"
					onanimationend={(e) => {
						if (e.target === e.currentTarget) swim = null;
					}}
				>
					<g class:mirror={swim === 'left'}>
						<g class="body">
							<path d="M5 0C3-2.7-2-2.9-4 0c2 2.9 7 2.7 9 0Z"></path>
							<path d="M-3.4 0-7.2-2.6-6.3 0-7.2 2.6Z"></path>
						</g>
					</g>
				</g>
			</g>
		{/if}
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

	/* the fish waits out of sight, left of the water; the page colour shows it on either theme's accent */
	.fish {
		fill: var(--bg);
		transform: translate(-12px, 40px);
	}
	.fish.right {
		animation: swim-right 3.6s ease-in-out forwards;
	}
	.fish.left {
		animation: swim-left 3.6s ease-in-out forwards;
	}
	.mirror {
		transform: scaleX(-1);
	}
	.body {
		transform-box: fill-box;
		transform-origin: center;
	}
	.right .body,
	.left .body {
		animation: wiggle 0.36s ease-in-out infinite alternate;
	}
	@keyframes swim-right {
		from {
			transform: translate(-12px, 40px);
		}
		50% {
			transform: translate(28px, 38.6px);
		}
		to {
			transform: translate(68px, 40px);
		}
	}
	@keyframes swim-left {
		from {
			transform: translate(68px, 39px);
		}
		50% {
			transform: translate(28px, 41.2px);
		}
		to {
			transform: translate(-12px, 40px);
		}
	}
	@keyframes wiggle {
		from {
			transform: rotate(-6deg);
		}
		to {
			transform: rotate(6deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fish {
			display: none;
		}
	}
</style>
