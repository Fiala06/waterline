// What a running test kit needs from the browser (#21): a chime and a buzz when
// a wait is up, and the screen kept awake while any timer runs. Every call is
// safe where the browser has none of it.

let audio: AudioContext | null = null;

/** Two short tones, made on the spot: no sound file to load, and it works offline. */
export function chime() {
	try {
		const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctx) return;
		audio ??= new Ctx();
		if (audio.state === 'suspended') void audio.resume();
		const t0 = audio.currentTime;
		for (const [i, f] of [880, 1175].entries()) {
			const o = audio.createOscillator();
			const g = audio.createGain();
			o.type = 'sine';
			o.frequency.value = f;
			g.gain.setValueAtTime(0.0001, t0 + i * 0.22);
			g.gain.exponentialRampToValueAtTime(0.3, t0 + i * 0.22 + 0.02);
			g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 0.2);
			o.connect(g).connect(audio.destination);
			o.start(t0 + i * 0.22);
			o.stop(t0 + i * 0.22 + 0.22);
		}
	} catch {
		/* no sound, then */
	}
}

/** Browsers only let a page make sound after a tap: warm the audio up from the Start button. */
export function primeAudio() {
	try {
		const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctx) return;
		audio ??= new Ctx();
		if (audio.state === 'suspended') void audio.resume();
	} catch {
		/* fine */
	}
}

export function buzz() {
	try {
		navigator.vibrate?.([200, 100, 200]);
	} catch {
		/* fine */
	}
}

// ── Wake lock: held while any timer runs, counted so the last one releases it ──
let holders = 0;
let lock: { release: () => Promise<void>; addEventListener?: (t: string, f: () => void) => void } | null = null;

async function acquire() {
	try {
		const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<typeof lock> } }).wakeLock;
		if (!wl || lock) return;
		lock = await wl.request('screen');
		// the lock goes when the tab is hidden; take it again when it's back, if timers still run
		lock?.addEventListener?.('release', () => {
			lock = null;
			if (holders > 0 && document.visibilityState === 'visible') void acquire();
		});
	} catch {
		lock = null;
	}
}

/** Keep the screen on while this timer runs; returns the function that lets go. */
export function keepAwake(): () => void {
	holders++;
	if (holders === 1) {
		void acquire();
		document.addEventListener('visibilitychange', onVisible);
	}
	let done = false;
	return () => {
		if (done) return;
		done = true;
		holders = Math.max(0, holders - 1);
		if (holders === 0) {
			document.removeEventListener('visibilitychange', onVisible);
			void lock?.release().catch(() => {});
			lock = null;
		}
	};
}
function onVisible() {
	if (document.visibilityState === 'visible' && holders > 0 && !lock) void acquire();
}
