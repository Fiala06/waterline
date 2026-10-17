<script lang="ts">
	// The barcode reader in the page (#147). The camera's frames go to the
	// browser's own BarcodeDetector where there is one (Chrome), else to
	// zxing-wasm served from here (never a CDN); the first product barcode read
	// is handed up and the camera stops. Where the camera can't open (a plain
	// http address, no permission, no camera) or there are no scripts, the photo
	// input posts to the server, which reads it with the same library; with
	// scripts the photo is tried here first, so it only travels when it has to.
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { NATIVE_FORMATS, normalizeBarcode, READ_FORMATS } from '$lib/barcode';
	import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

	let {
		onCode,
		looking = false,
		error = null
	}: {
		/** a product barcode was read: its canonical GTIN */
		onCode: (code: string) => void;
		/** the page is looking the last code up: say so instead of scanning on */
		looking?: boolean;
		/** what the server said about the last photo */
		error?: string | null;
	} = $props();

	type Hit = { rawValue: string; format: string };
	interface Reader {
		read(source: HTMLVideoElement | ImageBitmap): Promise<Hit[]>;
	}
	/** the Barcode Detection API, where the browser has it */
	interface NativeDetector {
		new (opts: { formats: string[] }): { detect(source: ImageBitmapSource): Promise<Hit[]> };
		getSupportedFormats(): Promise<string[]>;
	}

	let video = $state<HTMLVideoElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let photoForm = $state<HTMLFormElement | null>(null);
	let camera = $state<'starting' | 'on' | 'off' | 'unavailable'>('starting');
	let why = $state('');
	/** a picked photo being read here, or on the server */
	let reading = $state(false);
	let mounted = $state(false);
	let stream: MediaStream | null = null;
	let reader: Promise<Reader> | null = null;
	let scanning = false;
	/** the camera is wanted: a permission granted after Stop (or after leaving the page) is let go */
	let wanted = false;

	function makeReader(): Promise<Reader> {
		reader ??= (async () => {
			const Native = (globalThis as unknown as { BarcodeDetector?: NativeDetector }).BarcodeDetector;
			if (Native) {
				try {
					const supported = await Native.getSupportedFormats();
					const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
					if (formats.includes('ean_13')) {
						const d = new Native({ formats });
						return { read: (s) => d.detect(s) };
					}
				} catch {
					/* the bundled reader, then */
				}
			}
			const { prepareZXingModule, readBarcodes } = await import('zxing-wasm/reader');
			prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
			return {
				async read(source) {
					const w = source instanceof ImageBitmap ? source.width : source.videoWidth;
					const h = source instanceof ImageBitmap ? source.height : source.videoHeight;
					if (!w || !h) return [];
					// a frame at up to 1280px across: the bars stay readable, each look stays quick
					const scale = Math.min(1, 1280 / Math.max(w, h));
					canvas.width = Math.round(w * scale);
					canvas.height = Math.round(h * scale);
					ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
					const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
					const found = await readBarcodes(image, { formats: [...READ_FORMATS], tryHarder: source instanceof ImageBitmap, maxNumberOfSymbols: 2 });
					return found.map((r) => ({ rawValue: r.text, format: r.format }));
				}
			};
		})();
		return reader;
	}

	async function start() {
		if (!video) return;
		if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
			camera = 'unavailable';
			why = window.isSecureContext ? "This browser can't open the camera here; a photo works too." : 'The camera needs an https address; a photo works here too.';
			return;
		}
		camera = 'starting';
		wanted = true;
		let s: MediaStream;
		try {
			s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
		} catch (e) {
			camera = 'unavailable';
			const name = (e as { name?: string }).name;
			why =
				name === 'NotAllowedError'
					? 'The camera was not allowed; a photo works too.'
					: name === 'NotFoundError'
						? 'No camera on this device; a photo works too.'
						: "The camera couldn't be opened; a photo works too.";
			return;
		}
		if (!wanted || !video) {
			s.getTracks().forEach((t) => t.stop());
			return;
		}
		stream = s;
		video.srcObject = stream;
		try {
			await video.play();
		} catch {
			/* autoplay refused: the frames still come */
		}
		camera = 'on';
		scanning = true;
		void loop();
	}

	async function loop() {
		const r = await makeReader();
		while (scanning && video) {
			try {
				for (const hit of await r.read(video)) {
					const code = normalizeBarcode(hit.rawValue, hit.format);
					if (code) {
						stop();
						onCode(code);
						return;
					}
				}
			} catch {
				/* a frame that couldn't be read */
			}
			await new Promise((res) => setTimeout(res, 150));
		}
	}

	function stop() {
		scanning = false;
		wanted = false;
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		if (video) video.srcObject = null;
		if (camera === 'on' || camera === 'starting') camera = 'off';
	}

	onMount(() => {
		mounted = true;
		void start();
		return stop;
	});

	/** A picked photo: read here when it can be, else sent to the server, which tries harder. */
	async function picked() {
		const file = fileInput?.files?.[0];
		if (!file) return;
		reading = true;
		try {
			const r = await makeReader();
			const bitmap = await createImageBitmap(file);
			try {
				for (const hit of await r.read(bitmap)) {
					const code = normalizeBarcode(hit.rawValue, hit.format);
					if (code) {
						reading = false;
						if (fileInput) fileInput.value = '';
						stop();
						onCode(code);
						return;
					}
				}
			} finally {
				bitmap.close();
			}
		} catch {
			/* the server will try */
		}
		photoForm?.requestSubmit();
	}
</script>

<div class="scanner">
	{#if looking}
		<p class="status" role="status">Looking it up…</p>
	{:else}
		<div class="view" class:off={camera !== 'on'}>
			<!-- svelte-ignore a11y_media_has_caption -->
			<video bind:this={video} autoplay muted playsinline></video>
			<div class="frame" aria-hidden="true"></div>
		</div>
		<p class="status" role="status" aria-live="polite">
			{#if camera === 'on'}Point the camera at the barcode{:else if camera === 'starting'}Opening the camera…{:else if camera === 'unavailable'}{why}{:else}Camera off{/if}
		</p>
		{#if camera === 'on'}
			<div class="acts"><button type="button" class="btn" onclick={stop}>Stop camera</button></div>
		{:else if camera === 'off'}
			<div class="acts"><button type="button" class="btn" onclick={start}>Start camera</button></div>
		{/if}
	{/if}
	<form
		bind:this={photoForm}
		method="POST"
		action="?/photo"
		enctype="multipart/form-data"
		class="photo"
		use:enhance={() => {
			reading = true;
			return async ({ update }) => {
				await update({ reset: false });
				reading = false;
				if (fileInput) fileInput.value = '';
			};
		}}
	>
		<label class="btn file">
			<input bind:this={fileInput} class="sr-only" type="file" name="photo" accept="image/*" capture="environment" onchange={picked} disabled={reading} />
			{reading ? 'Reading…' : 'Take a photo of the barcode'}
		</label>
		{#if !mounted}<button class="btn send">Read the barcode</button>{/if}
		{#if error}<p class="error-text" role="alert">✕ {error}</p>{/if}
	</form>
</div>

<style>
	.scanner {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.view {
		position: relative;
		aspect-ratio: 4 / 3;
		max-height: 56dvh;
		background: var(--ink);
		overflow: hidden;
	}
	.view.off {
		display: none;
	}
	video {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.frame {
		position: absolute;
		inset: 22% 12%;
		border: 2px solid var(--accent);
		pointer-events: none;
	}
	.status {
		margin: 0;
		min-height: 20px;
		font-size: 14px;
		color: var(--text-muted);
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.photo {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 12px;
		border-top: 1px solid var(--divider);
	}
	.file {
		cursor: pointer;
	}
	.file:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.file:has(input:disabled) {
		opacity: 0.6;
		cursor: default;
	}
	.error-text {
		margin: 0;
	}
</style>
