<script lang="ts">
	// 7.6 · Photo upload. On phones the file input offers camera or library.
	// With JS, images are shrunk in the browser (max 2560px) before upload.
	import { photoUrl } from '$lib/media';

	let { existing = [], compact = false }: { existing?: { id: string }[]; compact?: boolean } = $props();
	const max = 10; // per entry

	let input: HTMLInputElement | undefined = $state();
	let previews = $state<{ url: string; name: string }[]>([]);
	let removed = $state<string[]>([]);
	let busy = $state(false);
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
		busy = true;
		const shrunk = await Promise.all(files.map(shrink));
		const dt = new DataTransfer();
		shrunk.forEach((f) => dt.items.add(f));
		input.files = dt.files;
		previews.forEach((p) => URL.revokeObjectURL(p.url));
		previews = shrunk.map((f) => ({ url: URL.createObjectURL(f), name: f.name }));
		busy = false;
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
		<label class="add" class:busy>
			<input bind:this={input} type="file" name="photos" accept="image/*" multiple {onchange} />
			{#if compact}<span>Photo</span>{:else}<span class="plus">+</span><span>{busy ? 'Adding…' : 'Add'}</span>{/if}
		</label>
	</div>
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
		gap: 8px;
	}
	.tile,
	.add {
		position: relative;
		width: 72px;
		height: 72px;
		border-radius: 12px;
		overflow: hidden;
		flex-shrink: 0;
	}
	.tile img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.tile.gone img {
		opacity: 0.3;
	}
	.x {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 24px;
		height: 24px;
		border-radius: 12px;
		background: rgba(3, 10, 12, 0.75);
		color: #e6f0f0;
		font-size: 12px;
	}
	.x::before {
		content: '';
		position: absolute;
		inset: -10px;
	}
	.add {
		border: 1px dashed var(--border-strong);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		font-size: 13px;
		color: var(--text-muted);
		cursor: pointer;
	}
	.add:focus-within {
		outline: 2px solid var(--accent);
	}
	.add.busy {
		opacity: 0.6;
	}
	.plus {
		font-size: 22px;
		line-height: 1;
		color: var(--accent);
	}
	.add input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.compact .tiles {
		flex-wrap: nowrap;
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
</style>
