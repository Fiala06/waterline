<script lang="ts">
	// Neutral category icons (accent on `selected`), so color only ever means status.
	type Kind =
		| 'test'
		| 'water_change'
		| 'dosing'
		| 'maintenance'
		| 'livestock'
		| 'equipment'
		| 'observation'
		| 'note';
	let { kind, size = 40, inverted = false }: { kind: Kind; size?: number; inverted?: boolean } = $props();
	const s = $derived(size / 40);
</script>

<span
	class="icon"
	class:inverted
	style:width="{size}px"
	style:height="{size}px"
	style:border-radius="{Math.round(size * 0.3)}px"
	style:--s={s}
	aria-hidden="true"
>
	{#if kind === 'test'}
		<i class="ring"></i>
	{:else if kind === 'water_change'}
		<i class="lines"></i>
	{:else if kind === 'dosing'}
		<i class="pill"></i>
	{:else if kind === 'maintenance'}
		<i class="diamond"></i>
	{:else if kind === 'livestock'}
		<i class="dot-big"></i><i class="dot-small"></i>
	{:else if kind === 'equipment'}
		<i class="square"></i>
	{:else if kind === 'observation'}
		<i class="ring-dot"><i></i></i>
	{:else}
		<i class="rounded"></i>
	{/if}
</span>

<style>
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: calc(2px * var(--s));
		background: var(--selected);
		flex-shrink: 0;
		--c: var(--accent);
	}
	.icon.inverted {
		background: var(--on-accent);
	}
	i {
		display: block;
		box-sizing: border-box;
	}
	.ring {
		width: calc(14px * var(--s));
		height: calc(14px * var(--s));
		border-radius: 50%;
		border: calc(2px * var(--s) + 0.5px) solid var(--c);
	}
	.lines {
		width: calc(16px * var(--s));
		height: calc(9px * var(--s));
		border-top: calc(2px * var(--s) + 0.5px) solid var(--c);
		border-bottom: calc(2px * var(--s) + 0.5px) solid var(--c);
	}
	.pill {
		width: calc(7px * var(--s));
		height: calc(18px * var(--s));
		border-radius: calc(4px * var(--s));
		border: calc(2px * var(--s)) solid var(--c);
	}
	.diamond {
		width: calc(12px * var(--s));
		height: calc(12px * var(--s));
		border: calc(2px * var(--s) + 0.5px) solid var(--c);
		transform: rotate(45deg);
	}
	.dot-big {
		width: calc(9px * var(--s));
		height: calc(9px * var(--s));
		border-radius: 50%;
		background: var(--c);
	}
	.dot-small {
		width: calc(5px * var(--s));
		height: calc(5px * var(--s));
		border-radius: 50%;
		background: var(--c);
		margin-top: calc(-7px * var(--s));
	}
	.square {
		width: calc(14px * var(--s));
		height: calc(14px * var(--s));
		border-radius: calc(2px * var(--s));
		background: var(--c);
	}
	.ring-dot {
		width: calc(16px * var(--s));
		height: calc(16px * var(--s));
		border-radius: 50%;
		border: calc(2px * var(--s) + 0.5px) solid var(--c);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.ring-dot i {
		width: calc(5px * var(--s));
		height: calc(5px * var(--s));
		border-radius: 50%;
		background: var(--c);
	}
	.rounded {
		width: calc(14px * var(--s));
		height: calc(14px * var(--s));
		border-radius: calc(3px * var(--s));
		border: calc(2px * var(--s) + 0.5px) solid var(--c);
	}
</style>
