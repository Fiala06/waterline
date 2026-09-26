<script lang="ts">
	// 7.6 · Photo upload. On phones the file input offers camera or library.
	// With JS, images are shrunk in the browser (max 2560px) before upload.
	import { photoUrl } from '$lib/media';

	let { existing = [], compact = false }: { existing?: { id: string }[]; compact?: boolean } = $props();
	const max = 10; // per entry

	let input: HTMLInputElement | undefined = $state();
	let previews = $state<{ url: string; name: string }[]>([]);
	let removed = $state<string[]>([]);
	let pending = $state(0); // photos being prepared
	let error = $state<string | null>(null);

	const MAX_EDGE = 2560;

	async function shrink(file: File): Promise<File> {
		if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
		try {
			const bmp = await createImageBitmap(file);
			const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
			if (scale === 1 && file.size < 2_500_000) return file;
			const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
			canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
			const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
			return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
		} catch {
			return file; // server will resize (or reject) it
		}
	}

	async function onchange() {
		if (!input?.files) return;
		error = null;
		const kept = existing.length - removed.length;
		let files = [...input.files];
		if (kept + files.length > max) {
			error = `Up to ${max} photos per entry.`;
			files = files.slice(0, Math.max(0, max - kept));
		}
		previews.forEach((p) => URL.revokeObjectURL(p.url));
		previews = [];
		pending = files.length;
		const shrunk = await Promise.all(files.map(shrink));
		const dt = new DataTransfer();
		shrunk.forEach((f) => dt.items.add(f));
		input.files = dt.files;
		previews = shrunk.map((f) => ({ url: URL.createObjectURL(f), name: f.name }));
		pending = 0;
	}

	function removeNew(i: number) {
		if (!input?.files) return;
		const dt = new DataTransfer();
		[...input.files].forEach((f, j) => j !== i && dt.items.add(f));
		input.files = dt.files;
		URL.revokeObjectURL(previews[i].url);
		previews = previews.filter((_, j) => j !== i);
	}

	function toggleExisting(id: string) {
		removed = removed.includes(id) ? removed.filter((x) => x !== id) : [...removed, id];
	}
</script>

<div class="picker" class:compact>
	{#if !compact}<span class="label">Photos</span>{/if}
	<div class="tiles">
		{#each existing as p (p.id)}
			<div class="tile" class:gone={removed.includes(p.id)}>
				<img src={photoUrl(p.id)} alt="" loading="lazy" />
				<button type="button" class="x" aria-label={removed.includes(p.id) ? 'Keep photo' : 'Remove photo'} onclick={() => toggleExisting(p.id)}
					>{removed.includes(p.id) ? '↺' : '✕'}</button
				>
			</div>
		{/each}
		{#each removed as id (id)}<input type="hidden" name="removePhoto" value={id} />{/each}
		{#each previews as p, i (p.url)}
			<div class="tile">
				<img src={p.url} alt={p.name} />
				<button type="button" class="x" aria-label="Remove {p.name}" onclick={() => removeNew(i)}>✕</button>
			</div>
		{/each}
		{#each Array.from({ length: pending }, (_, i) => i) as i (i)}
			<div class="tile uploading" aria-hidden="true">
				<span class="bar"><i></i></span>
				{#if !compact}<span>Adding…</span>{/if}
			</div>
		{/each}
		<label class="add" class:busy={pending > 0}>
			<input bind:this={input} type="file" name="photos" accept="image/*" multiple {onchange} />
			{#if compact}<span class="hide-desk">Photo</span><span class="hide-phone">Add photo</span>{:else}<span class="plus" aria-hidden="true">+</span><span>Add</span>{/if}
		</label>
	</div>
	<!-- a live region, not role="status": the app's toast is the page's status -->
	<span class="sr-only" aria-live="polite">{pending ? 'Adding photos…' : ''}</span>
	{#if error}<span class="error-text">✕ {error}</span>{/if}
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.label {
		font-size: 14px;
		color: var(--text-muted);
	}
	.tiles {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		/* room for the remove chips that overhang the top corner */
		padding-top: 6px;
	}
	.tile,
	.add {
		position: relative;
		width: 84px;
		height: 84px;
		border-radius: 12px;
		flex-shrink: 0;
	}
	.tile img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: var(--surface-hi);
	}
	.tile.gone img {
		opacity: 0.3;
	}
	/* Remove: the button is the 44px tap area; the 24px ring over the corner is drawn inside it (7.6 "Added") */
	.x {
		position: absolute;
		top: -16px;
		right: -16px;
		width: 44px;
		height: 44px;
		z-index: 1;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.x::before {
		content: '';
		position: absolute;
		inset: 10px;
		z-index: -1;
		border-radius: 50%;
		background: var(--bg);
		border: 1px solid var(--border-strong);
	}
	.x:focus-visible {
		outline: none;
	}
	.x:focus-visible::before {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	@media (hover: hover) {
		.x:hover {
			color: var(--text);
		}
		.x:hover::before {
			border-color: var(--text-faint);
		}
	}
	/* 7.6 "Uploading": being prepared for upload */
	.uploading {
		background: var(--surface);
		border: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 0 12px;
		font-size: 12px;
		color: var(--text-muted);
	}
	.bar {
		width: 100%;
		height: 4px;
		border-radius: 2px;
		background: var(--border);
		overflow: hidden;
	}
	.bar i {
		display: block;
		width: 60%;
		height: 100%;
		background: var(--accent);
		animation: wl-pulse 1.4s ease-in-out infinite;
	}
	/* 7.6 "Empty" */
	.add {
		border: 1px dashed var(--border-strong);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		font-size: 13px;
		font-weight: 600;
		color: var(--accent);
		cursor: pointer;
	}
	.add:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.add.busy {
		opacity: 0.6;
	}
	@media (hover: hover) {
		.add:hover {
			border-color: var(--accent);
			background: var(--selected);
		}
	}
	.plus {
		font-size: 24px;
		font-weight: 400;
		line-height: 1;
	}
	.add input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.compact .tiles {
		flex-wrap: nowrap;
		gap: 8px;
		padding-top: 0;
	}
	.compact .x {
		top: -15px;
		right: -15px;
		width: 40px;
		height: 40px;
	}
	.compact .add {
		width: auto;
		height: 48px;
		padding: 0 14px;
		border: 1px solid var(--border-strong);
		font-size: 15px;
		color: var(--text);
	}
	.compact .tile {
		width: 48px;
		height: 48px;
		border-radius: 10px;
	}
	.compact .tile img {
		border-radius: 10px;
	}
	.compact .uploading {
		padding: 0 8px;
	}
</style>
