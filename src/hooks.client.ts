// Browsers only provide crypto.randomUUID over HTTPS (and on localhost). A server
// run on plain HTTP (a LAN-only ORIGIN) still needs it for the log forms' entry IDs.
if (typeof crypto.randomUUID !== 'function') {
	crypto.randomUUID = () => {
		const b = crypto.getRandomValues(new Uint8Array(16));
		b[6] = (b[6] & 0x0f) | 0x40; // version 4
		b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
		const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
		return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` as ReturnType<Crypto['randomUUID']>;
	};
}
