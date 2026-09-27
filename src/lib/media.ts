/** URL for a photo file (served by /media/[id], owner only). */
export const photoUrl = (id: string, size: 'full' | 'thumb' = 'thumb') =>
	`/media/${id}${size === 'thumb' ? '?size=thumb' : ''}`;

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
