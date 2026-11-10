// A body read no further than a limit, whatever its content-length says (or
// doesn't): what another machine sends is counted as it arrives, and the
// reading stops past the cap rather than buffering it all first (#212).

export class BodyTooLarge extends Error {
	constructor() {
		super('The answer was too large');
		this.name = 'BodyTooLarge';
	}
}

/** The body as text, or BodyTooLarge once it passes `limit` bytes. */
export async function readCappedText(res: { headers: Headers; body: ReadableStream<Uint8Array> | null }, limit: number): Promise<string> {
	if (Number(res.headers.get('content-length') ?? 0) > limit) {
		await res.body?.cancel().catch(() => {});
		throw new BodyTooLarge();
	}
	const reader = res.body?.getReader();
	if (!reader) return '';
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > limit) {
			await reader.cancel().catch(() => {});
			throw new BodyTooLarge();
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks).toString('utf8');
}
