<script lang="ts">
	// ⓘ: a short explanation beside a parameter or field. Tap
	// or click to open, hover with a mouse; tap outside or Esc closes. A native
	// popover, so it works without scripts (in the middle of the screen); with
	// them it sits by its button. Screen readers hear the text on the button.
	let { text, label }: { text: string; /** "About KH" */ label: string } = $props();
	const id = $props.id();
	let btn = $state<HTMLButtonElement>();
	let pop = $state<HTMLElement>();
	let byHover = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	function before(e: Event) {
		if ((e as ToggleEvent).newState === 'open' && pop) pop.style.visibility = 'hidden';
	}
	// under the button, starting where it does (it follows a name), or above it near the bottom; never off screen
	function place(e: Event) {
		if (!pop || !btn) return;
		if ((e as ToggleEvent).newState !== 'open') {
			byHover = false;
			removeEventListener('scroll', close, true);
			return;
		}
		const b = btn.getBoundingClientRect();
		pop.style.inset = 'auto';
		pop.style.margin = '0';
		const p = pop.getBoundingClientRect();
		const left = Math.min(Math.max(12, b.left - 10), innerWidth - p.width - 12);
		const below = b.bottom + 8;
		pop.style.left = `${left}px`;
		pop.style.top = `${below + p.height > innerHeight - 12 ? Math.max(12, b.top - p.height - 8) : below}px`;
		pop.style.visibility = '';
		// it's fixed on screen: scrolling the page would leave it behind
		addEventListener('scroll', close, true);
	}
	const close = () => pop?.hidePopover();

	function enter() {
		if (!matchMedia('(hover: hover)').matches) return;
		timer = setTimeout(() => {
			if (pop && !pop.matches(':popover-open')) {
				byHover = true;
				pop.showPopover();
			}
		}, 300);
	}
	function leave() {
		clearTimeout(timer);
		if (byHover) close();
	}
	// a click on a tip that hovering opened keeps it open
	function click(e: MouseEvent) {
		clearTimeout(timer);
		if (byHover) {
			byHover = false;
			e.preventDefault();
		}
	}
</script>

<button
	type="button"
	class="tip"
	bind:this={btn}
	popovertarget={id}
	aria-label={label}
	aria-describedby={id}
	onmouseenter={enter}
	onmouseleave={leave}
	onclick={click}><span aria-hidden="true">i</span></button
><span {id} popover class="tip-pop" bind:this={pop} onbeforetoggle={before} ontoggle={place}>{text}</span>

<style>
	.tip {
		position: relative;
		flex-shrink: 0;
		display: inline-grid;
		place-items: center;
		width: 17px;
		height: 17px;
		padding: 0;
		border-radius: 50%;
		border: 1.5px solid var(--text-faint);
		background: none;
		color: var(--text-muted);
		font: italic 700 11px/1 Georgia, 'Times New Roman', serif;
		vertical-align: middle;
		cursor: pointer;
	}
	/* 17px to sit beside a name, 44px to tap */
	.tip::after {
		content: '';
		position: absolute;
		inset: -14px;
	}
	.tip:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.tip:has(+ :popover-open) {
		border-color: var(--accent);
		color: var(--accent-text);
	}
	@media (hover: hover) {
		.tip:hover {
			border-color: var(--accent);
			color: var(--accent-text);
		}
	}
	.tip-pop {
		max-width: min(290px, calc(100vw - 24px));
		padding: 10px 12px;
		background: var(--bg);
		border: 2px solid var(--ink);
		box-shadow: var(--shadow-lg);
		color: var(--text);
		/* it sits inside a name or label in the page: none of their type */
		font-size: 13px;
		font-weight: 400;
		font-style: normal;
		line-height: 1.45;
		text-align: left;
		white-space: normal;
		text-transform: none;
		letter-spacing: normal;
	}
</style>
