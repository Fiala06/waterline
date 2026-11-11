// Species photos still on their way from Wikimedia (Livestock, Plants; #268):
// look again in a moment, a few times. Call while the page initialises.
import { invalidateAll } from '$app/navigation';

export function reloadWhilePhotosPending(pending: () => boolean, { every = 2500, times = 4 } = {}) {
	let tries = 0;
	$effect(() => {
		if (!pending() || tries >= times) return;
		const t = setTimeout(() => {
			tries++;
			invalidateAll();
		}, every);
		return () => clearTimeout(t);
	});
}
