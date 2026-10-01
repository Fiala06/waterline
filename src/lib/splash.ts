// Mark done's little celebration: a check that pops where the button was,
// with a ring and a few drops of water splashing out. It's drawn over the
// page, so it plays out even as the task's row moves away. Nothing for
// reduced motion, and nothing when Mark done opens a log form instead.
import type { SubmitFunction } from '@sveltejs/kit';

export function splash(at: { x: number; y: number }) {
	if (typeof document === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	const el = document.createElement('div');
	el.className = 'splash';
	el.setAttribute('aria-hidden', 'true');
	el.style.left = `${at.x}px`;
	el.style.top = `${at.y}px`;
	el.innerHTML =
		'<span class="splash-ring"></span><svg class="splash-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' +
		Array.from({ length: 7 }, (_, i) => `<span class="splash-drop" style="--a:${i * (360 / 7) - 90}deg"></span>`).join('');
	document.body.append(el);
	setTimeout(() => el.remove(), 1000);
}

/** use:enhance for a Mark done form: the splash when it's done (not when it opens the water change or test form). */
export const markDone: SubmitFunction = ({ submitter }) => {
	const r = submitter?.getBoundingClientRect();
	const at = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
	return async ({ result, update }) => {
		if (at && result.type === 'redirect' && !result.location.startsWith('/entries/')) splash(at);
		await update();
	};
};
