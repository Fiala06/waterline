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
