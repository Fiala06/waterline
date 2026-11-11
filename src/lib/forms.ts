// One submission per form at a time (#255): while a form's request is out, a
// second submit is cancelled, the form is aria-busy and the button that sent
// it is disabled. Both are released when the answer has been handled.
import type { SubmitFunction } from '@sveltejs/kit';

type Input = Parameters<SubmitFunction>[0];
type After = Exclude<Awaited<ReturnType<SubmitFunction>>, void>;

const inFlight = new WeakSet<HTMLFormElement>();

/**
 * Call from a SubmitFunction with its input and the callback it would return;
 * returns the callback to hand back to `use:enhance`.
 */
export function once(input: Input, after: After): After | undefined {
	const { formElement: form, submitter, cancel } = input;
	if (inFlight.has(form)) {
		cancel();
		return undefined;
	}
	inFlight.add(form);
	form.setAttribute('aria-busy', 'true');
	const button = submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : null;
	const wasDisabled = button?.disabled ?? false;
	if (button) button.disabled = true;
	const release = () => {
		inFlight.delete(form);
		form.removeAttribute('aria-busy');
		if (button && !wasDisabled) button.disabled = false;
	};
	return async (opts) => {
		try {
			await after(opts);
		} finally {
			release();
		}
	};
}

// ── A refused form (#269) ────────────────────────────────────────────────────
// Every action that turns a form down answers in one shape, built on the server
// by `refuse()` (src/lib/server/forms.ts): which form it was, a message for the
// form as a whole, one per field, and what was typed so it can be put back.

export interface Refusal {
	/** which form on the page was refused, e.g. 'par' */
	form: string;
	/** for the form as a whole ('' when only fields are at fault) */
	message: string;
	/** per field, by the input's name */
	errors: Record<string, string>;
	/** what was typed, to fill the form in again */
	values: Record<string, unknown>;
}

const NONE: Refusal = { form: '', message: '', errors: {}, values: {} };

/** The page's `form` prop, read for one form: its refusal, or an empty one when it was another form or none. */
export function refusal(form: unknown, name: string): Refusal {
	const r = (form as { refused?: Refusal } | null | undefined)?.refused;
	return r && r.form === name ? r : NONE;
}

// ── What a form does once it's answered (#268) ──────────────────────────────

/** Keep what was typed: the page stays, with its fields as they were. */
export const keepValues: SubmitFunction = () => async ({ update }) => update({ reset: false });

/** An inline editor closes once its change is saved (the action redirects back). */
export const closeOnRedirect =
	(close: () => void): SubmitFunction =>
	() =>
	async ({ result, update }) => {
		if (result.type === 'redirect') close();
		await update();
	};

/**
 * An add form empties its fields once saved, ready for the next one (the page
 * stays, so they'd keep what was typed). Choices (radios, checkboxes) and hidden
 * fields stay as they are.
 */
export const clearOnRedirect: SubmitFunction =
	({ formElement }) =>
	async ({ result, update }) => {
		await update();
		if (result.type !== 'redirect') return;
		for (const el of formElement.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea')) el.value = '';
	};
