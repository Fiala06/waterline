/**
 * Only allow same-site paths as post-action redirect targets. Control
 * characters and backslashes are refused too: browsers strip or rewrite them,
 * which can turn "/\t/evil.example" into "//evil.example".
 */
export function safeReturn(value: FormDataEntryValue | string | null | undefined, fallback = '/'): string {
	const s = typeof value === 'string' ? value : '';
	if (!s.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(s)) return fallback;
	return new URL(s, 'http://x').origin === 'http://x' ? s : fallback;
}
