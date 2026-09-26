// Svelte actions shared by several screens.

const ACTIVE = '[aria-current="page"], [aria-current="true"], [aria-pressed="true"], .selected';

function activeIn(node: HTMLElement) {
	try {
		return node.querySelector<HTMLElement>(`${ACTIVE}, :has(> input:checked)`);
	} catch {
		return node.querySelector<HTMLElement>(ACTIVE); // no :has() support
	}
}

/**
 * A sideways-scrolling row of chips or tabs (`class="hscroll"`): keeps the
 * active item in view and fades the edge that has more to scroll to.
 * Pass the active key so a new choice is scrolled to as well:
 * `use:hscroll={selectedId}`.
 */
export function hscroll(node: HTMLElement, _active?: unknown) {
	const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

	function fade() {
		const max = node.scrollWidth - node.clientWidth;
		const left = node.scrollLeft;
		node.dataset.fade = max <= 1 ? 'none' : left <= 1 ? 'end' : left >= max - 1 ? 'start' : 'both';
	}

	function reveal(smooth: boolean) {
		const el = activeIn(node);
		if (el) {
			const box = node.getBoundingClientRect();
			const r = el.getBoundingClientRect();
			const pad = 32; // clear of the edge fade
			let by = 0;
			if (r.left < box.left + pad) by = r.left - box.left - pad;
			else if (r.right > box.right - pad) by = r.right - box.right + pad;
			if (by) node.scrollBy({ left: by, behavior: smooth && !still ? 'smooth' : 'auto' });
		}
		fade();
	}

	reveal(false);
	node.addEventListener('scroll', fade, { passive: true });
	const ro = new ResizeObserver(fade);
	ro.observe(node);

	return {
		update() {
			// after the DOM reflects the new choice
			requestAnimationFrame(() => reveal(true));
		},
		destroy() {
			node.removeEventListener('scroll', fade);
			ro.disconnect();
		}
	};
}
