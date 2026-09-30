/** URL for a photo file (served by /media/[id], owner only). */
export const photoUrl = (id: string, size: 'full' | 'thumb' = 'thumb') =>
	`/media/${id}${size === 'thumb' ? '?size=thumb' : ''}`;

/** The cover photo's focus as CSS object-position ("50% 30%"); the middle when it's never been moved. */
export const coverPosition = (x: number | null | undefined, y: number | null | undefined) => `${clampPct(x)}% ${clampPct(y)}%`;

/** A focus coordinate, 0–100; 50 for anything else. */
export function clampPct(v: unknown): number {
	const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
	return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 50;
}

/**
 * Where the focus moves when the photo is dragged by `dx`/`dy` px in a frame
 * `frame` px big, the photo `natural` px big and shown with object-fit: cover.
 * Dragging right shows more of the left, so the focus moves left.
 */
export function dragFocus(
	start: { x: number; y: number },
	d: { dx: number; dy: number },
	frame: { w: number; h: number },
	natural: { w: number; h: number }
): { x: number; y: number } {
	const s = Math.max(frame.w / natural.w, frame.h / natural.h);
	const spareX = natural.w * s - frame.w;
	const spareY = natural.h * s - frame.h;
	return {
		x: spareX > 0.5 ? clampPct(start.x - (d.dx / spareX) * 100) : start.x,
		y: spareY > 0.5 ? clampPct(start.y - (d.dy / spareY) * 100) : start.y
	};
}

/**
 * Shrink a photo in the browser before it's uploaded: at most `maxEdge` px on
 * its longer side, as a JPEG. Small photos and GIFs go as they are; anything
 * the browser can't read goes too, for the server to resize (or refuse).
 */
export async function shrinkImage(file: File, maxEdge: number, keepUnder = 2_500_000): Promise<File> {
	if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
	try {
		const bmp = await createImageBitmap(file);
		const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
		if (scale === 1 && file.size < keepUnder) return file;
		const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
		canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
		const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
		return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
	} catch {
		return file;
	}
}
