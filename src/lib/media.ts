/** URL for a photo file (served by /media/[id], owner only). */
export const photoUrl = (id: string, size: 'full' | 'thumb' = 'thumb') =>
	`/media/${id}${size === 'thumb' ? '?size=thumb' : ''}`;
