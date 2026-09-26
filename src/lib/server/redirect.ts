/** Only allow same-site relative paths as post-action redirect targets. */
export function safeReturn(value: FormDataEntryValue | string | null | undefined, fallback = '/'): string {
	const s = typeof value === 'string' ? value : '';
	return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : fallback;
}
