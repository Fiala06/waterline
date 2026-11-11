// The readout's wiring, shared by TrendChart and OverlayChart (#264): hover,
// tap or drag for the reading nearest the pointer, the arrow keys, Home and End
// to step through them (the chart is a slider), Escape or a tap elsewhere to
// put it away, and a click (or Enter) to open that test. Construct it while
// the chart initialises: it starts its own effects.
import { goto } from '$app/navigation';
import { keyIndex, nearestIndex } from './trend-chart';

export interface ChartPointerOptions {
	/** the chart's box: the pointer is measured from its left edge, and a tap outside it puts the readout away */
	el: () => HTMLElement | undefined;
	/** each reading's x, left to right */
	xs: () => number[];
	/** the test the readout is on, for a click or Enter */
	href: () => string | undefined;
	/** read when the series changes (another parameter or range): the readout starts over */
	series: () => unknown;
}

export class ChartPointer {
	/** the reading being read out, by its place in `xs`; null when none is */
	active = $state<number | null>(null);
	#o: ChartPointerOptions;
	#pointerType = 'mouse';

	constructor(o: ChartPointerOptions) {
		this.#o = o;
		// a tap outside the chart puts a finger's readout away
		$effect(() => {
			if (this.active == null) return;
			const away = (e: PointerEvent) => {
				const el = this.#o.el();
				if (el && !el.contains(e.target as Node)) this.active = null;
			};
			window.addEventListener('pointerdown', away);
			return () => window.removeEventListener('pointerdown', away);
		});
		$effect(() => {
			void this.#o.series();
			this.active = null;
		});
	}

	/** the markers, their popover and the readout are beside the plot's reading, not part of it */
	#onMarker = (e: Event) => !!(e.target as Element | null)?.closest?.('.marker, .pop, .readout');

	#showAt(clientX: number) {
		const el = this.#o.el();
		const xs = this.#o.xs();
		if (!el || !xs.length) return;
		this.active = nearestIndex(xs, clientX - el.getBoundingClientRect().left);
	}

	onpointermove = (e: PointerEvent) => {
		// a mouse just hovers; a finger or pen drags along the line
		if (!this.#onMarker(e) && (e.pointerType === 'mouse' || e.buttons)) this.#showAt(e.clientX);
	};

	onpointerdown = (e: PointerEvent) => {
		this.#pointerType = e.pointerType;
		if (!this.#onMarker(e)) this.#showAt(e.clientX);
	};

	onpointerleave = (e: PointerEvent) => {
		if (e.pointerType === 'mouse') this.active = null;
	};

	// a mouse click opens the reading's test; a finger reads first, then taps the readout's link
	onclick = (e: MouseEvent) => {
		const href = this.#o.href();
		if (this.#onMarker(e) || this.#pointerType !== 'mouse' || !href) return;
		goto(href);
	};

	onkeydown = (e: KeyboardEvent) => {
		const end = this.#o.xs().length - 1;
		if (end < 0) return;
		const next = keyIndex(e.key, this.active, end);
		const href = this.#o.href();
		if (next !== undefined) this.active = next;
		else if (e.key === 'Enter' && href) goto(href);
		else return;
		e.preventDefault();
	};
}
