<script lang="ts">
	// The tank's cover on Tank setup › Details (moved out of the page, #270): change
	// it, or choose one of the tank's photos, then drag it (or use the arrow keys) to
	// choose which part shows. It's saved with the page's form, so it sits inside it:
	// the file, the chosen photo and the position are that form's fields.
	import { untrack } from 'svelte';
	import { dragFocus, photoUrl } from '$lib/media';

	let {
		cover,
		coverX,
		coverY,
		photos
	}: {
		/** the saved cover's photo id */
		cover: string | null;
		coverX: number;
		coverY: number;
		/** the tank's photos to choose from */
		photos: { id: string; day: string }[];
	} = $props();

	let coverPreview = $state<string | null>(null);
	function pickCover(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (coverPreview) URL.revokeObjectURL(coverPreview);
		coverPreview = f ? URL.createObjectURL(f) : null;
		chosenPhoto = null;
		// a new photo starts in the middle
		focus = { x: 50, y: 50 };
		moved = !!f;
	}
	// Choose from photos: one of the tank's own, previewed at once and saved with the rest
	let chosenPhoto = $state<string | null>(null);
	let choosing = $state(false);
	function choosePhoto(id: string) {
		if (coverPreview?.startsWith('blob:')) URL.revokeObjectURL(coverPreview);
		chosenPhoto = id;
		coverPreview = photoUrl(id, 'full');
		focus = { x: 50, y: 50 };
		moved = true;
		choosing = false;
	}

	// Drag the cover to choose which part shows, as on Facebook; it's saved
	// with the rest (Save changes). Arrow keys move it too.
	let focus = $state(untrack(() => ({ x: coverX, y: coverY })));
	let moved = $state(false);
	// once saved: where it is now, nothing left to save
	$effect(() => {
		const saved = { x: coverX, y: coverY, cover: cover };
		untrack(() => {
			focus = { x: saved.x, y: saved.y };
			moved = false;
			if (coverPreview?.startsWith('blob:')) URL.revokeObjectURL(coverPreview);
			coverPreview = null;
			chosenPhoto = null;
		});
	});
	let frame = $state<HTMLElement>();
	let img = $state<HTMLImageElement>();
	let drag: { id: number; x: number; y: number; start: { x: number; y: number } } | null = null;
	const sizes = () =>
		frame && img?.naturalWidth
			? { frame: { w: frame.clientWidth, h: frame.clientHeight }, natural: { w: img.naturalWidth, h: img.naturalHeight } }
			: null;
	function down(e: PointerEvent) {
		if (!img || (e.target as HTMLElement).closest('.change')) return;
		drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: { ...focus } };
		// the photo keeps the pointer while it moves, even off its edge
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		e.preventDefault();
	}
	function move(e: PointerEvent) {
		const z = sizes();
		if (!drag || drag.id !== e.pointerId || !z) return;
		focus = dragFocus(drag.start, { dx: e.clientX - drag.x, dy: e.clientY - drag.y }, z.frame, z.natural);
		moved = true;
	}
	function up(e: PointerEvent) {
		if (drag?.id === e.pointerId) drag = null;
	}
	function key(e: KeyboardEvent) {
		const step = e.shiftKey ? 10 : 2;
		const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
		if (!d) return;
		e.preventDefault();
		focus = { x: Math.min(100, Math.max(0, focus.x + d[0])), y: Math.min(100, Math.max(0, focus.y + d[1])) };
		moved = true;
	}
</script>

<div class="cover" class:photo-placeholder={!coverPreview && !cover} class:movable={coverPreview || cover} bind:this={frame}>
	{#if coverPreview || cover}
		<!-- dragged, or moved with the arrow keys; its label says so -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<img
			bind:this={img}
			src={coverPreview ?? photoUrl(cover!, 'full')}
			alt="Tank cover. Drag, or use the arrow keys, to choose which part shows."
			style:object-position="{focus.x}% {focus.y}%"
			draggable="false"
			tabindex="0"
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
			onkeydown={key}
		/>
		<span class="drag-hint" aria-hidden="true">✥ Drag to reposition</span>
		<input type="hidden" name="coverX" value={focus.x} />
		<input type="hidden" name="coverY" value={focus.y} />
	{/if}
	<div class="change-acts">
		{#if photos.length}
			<button type="button" class="btn change" aria-expanded={choosing} aria-controls="cover-photos" onclick={() => (choosing = !choosing)}>Choose from photos</button>
		{/if}
		<label class="change btn">
			Change cover
			<input type="file" name="cover" accept="image/*" onchange={pickCover} />
		</label>
	</div>
</div>
{#if photos.length}
	<!-- the tank's photos as radios: a pick previews above (with scripts) and is saved with the rest; without scripts the list is open -->
	<details class="pick" id="cover-photos" open={choosing} ontoggle={(e) => (choosing = e.currentTarget.open)}>
		<summary class="sr-only">Choose the cover from the tank's photos</summary>
		<div class="pick-grid" role="radiogroup" aria-label="Cover photo">
			{#each photos as p (p.id)}
				<label class="pick-one" class:on={(chosenPhoto ?? (coverPreview ? null : cover)) === p.id}>
					<input type="radio" name="coverPhotoId" value={p.id} checked={chosenPhoto === p.id} onchange={() => choosePhoto(p.id)} />
					<img src={photoUrl(p.id)} alt="Photo from {p.day}" loading="lazy" />
					<span class="pick-day">{p.day}</span>
				</label>
			{/each}
		</div>
	</details>
{/if}
{#if moved}<span class="moved" aria-live="polite">Save changes to keep it there.</span>{/if}

<style>
	.cover {
		position: relative;
		height: 200px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		background: var(--surface);
	}
	.cover img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	/* drag the photo to move it in its frame */
	.movable img {
		cursor: grab;
		touch-action: none;
		user-select: none;
		-webkit-user-drag: none;
	}
	.movable img:active {
		cursor: grabbing;
	}
	.movable img:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.drag-hint {
		position: absolute;
		left: 12px;
		bottom: 12px;
		padding: 6px 10px;
		background: var(--ink);
		color: var(--bg);
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		pointer-events: none;
	}
	.moved {
		margin-top: -10px;
		font-size: 13px;
		color: var(--text-muted);
	}
	.change-acts {
		position: absolute;
		right: 12px;
		bottom: 12px;
		display: flex;
		gap: 8px;
	}
	.change {
		position: relative;
		background: var(--bg);
		cursor: pointer;
		min-height: 44px;
	}
	/* Choose from photos: thumbnails under the cover, the current one outlined */
	.pick {
		margin-top: -8px;
	}
	.pick-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
		gap: 6px;
		padding: 10px 0 0;
		border-top: 1px solid var(--divider);
	}
	.pick-one {
		position: relative;
		display: block;
		aspect-ratio: 1;
		cursor: pointer;
		outline: 2px solid transparent;
		outline-offset: 2px;
	}
	.pick-one.on {
		outline-color: var(--accent);
	}
	.pick-one:focus-within {
		outline-color: var(--ink);
	}
	.pick-one input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.pick-one img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		background: var(--surface);
	}
	.pick-day {
		position: absolute;
		left: 0;
		bottom: 0;
		padding: 2px 6px;
		background: var(--ink);
		color: var(--bg);
		font-size: 11px;
		font-weight: 700;
		pointer-events: none;
	}
	/* phones: the two cover buttons take the bottom edge, so the drag hint moves up */
	@media (max-width: 599px) {
		.change-acts {
			left: 12px;
			justify-content: flex-end;
			flex-wrap: wrap;
		}
		.drag-hint {
			bottom: auto;
			top: 12px;
		}
	}
	.change input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.change:focus-within {
		outline: 2px solid var(--accent);
	}
</style>
