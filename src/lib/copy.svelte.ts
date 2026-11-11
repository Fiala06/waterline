// Copy to the clipboard, and say so for a moment (#268): the AI assistant and
// sensor tokens, their examples and a tank's public link. Where the clipboard is
// blocked nothing is said: the text can still be selected.
export class Copier {
	/** what was just copied, by the name it was copied under, for "✓ Copied" */
	which = $state<string | null>(null);
	#timer: ReturnType<typeof setTimeout> | undefined;

	copy = async (what: string, text: string) => {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			return;
		}
		this.which = what;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => (this.which = null), 2000);
	};
}
