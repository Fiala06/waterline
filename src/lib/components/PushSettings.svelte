<script lang="ts">
	// Push notifications (#16), under Settings › Notifications: this device
	// (Web Push, needs scripts and HTTPS), every device that has it, an ntfy
	// topic, and a test. Removing a device, ntfy and the test work without scripts.
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { fmtDate, dateInZone } from '$lib/time';
	import { toast } from '$lib/ui.svelte';

	let {
		push,
		timeZone,
		form
	}: {
		push: {
			publicKey: string;
			devices: { id: string; label: string; endpoint: string; createdAt: string; lastSentAt: string | null }[];
			ntfyUrl: string | null;
			ntfyToken: boolean;
		};
		timeZone: string;
		/** the page's form result: an ntfy or test problem */
		form: Record<string, unknown> | null | undefined;
	} = $props();
	const ntfyError = $derived(typeof form?.ntfyError === 'string' ? form.ntfyError : '');
	const pushError = $derived(typeof form?.pushError === 'string' ? form.pushError : '');
	const typedUrl = $derived(typeof form?.ntfyUrl === 'string' ? form.ntfyUrl : null);

	type State = 'checking' | 'insecure' | 'ios' | 'unsupported' | 'denied' | 'ready';
	let support = $state<State>('checking');
	let busy = $state(false);
	/** this device's subscription, when it has one */
	let mine = $state<string | null>(null);
	const registered = $derived(!!mine && push.devices.some((d) => d.endpoint === mine));
	const mode = $derived(support === 'ready' ? (registered ? 'on' : 'off') : support);

	const key = (b64: string) => {
		const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
		return Uint8Array.from(raw, (c) => c.charCodeAt(0));
	};
	const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && new Uint8Array(a).every((x, i) => x === b[i]) && a.byteLength === b.length;

	async function registration() {
		const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
		if (!reg) throw new Error('no service worker');
		return reg;
	}

	onMount(async () => {
		const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		if (!isSecureContext) support = 'insecure';
		else if (!('PushManager' in window) || !('serviceWorker' in navigator) || !('Notification' in window)) support = ios ? 'ios' : 'unsupported';
		else if (Notification.permission === 'denied') support = 'denied';
		else {
			try {
				const reg = await navigator.serviceWorker.getRegistration();
				mine = (await reg?.pushManager.getSubscription())?.endpoint ?? null;
			} catch {
				mine = null;
			}
			support = 'ready';
		}
	});

	async function turnOn() {
		busy = true;
		try {
			const perm = await Notification.requestPermission();
			if (perm !== 'granted') {
				if (perm === 'denied') support = 'denied';
				return;
			}
			const reg = await registration();
			const app = key(push.publicKey);
			let sub = await reg.pushManager.getSubscription();
			// made for another server key (it changed): start again
			if (sub && !sameKey(sub.options.applicationServerKey, app)) {
				await sub.unsubscribe();
				sub = null;
			}
			sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: app });
			const res = await fetch('/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
			if (!res.ok) throw new Error(await res.text());
			mine = sub.endpoint;
			await invalidateAll();
			toast('✓ Push is on for this device');
		} catch {
			toast("✕ Couldn't turn on push here. Try again, or use ntfy.");
		} finally {
			busy = false;
		}
	}

	async function turnOff() {
		busy = true;
		try {
			const sub = await (await registration()).pushManager.getSubscription();
			const endpoint = sub?.endpoint ?? mine;
			await sub?.unsubscribe();
			await fetch('/push', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint }) });
			mine = null;
			await invalidateAll();
			toast("This device won't get notifications any more");
		} catch {
			toast("✕ Couldn't turn it off. Try again.");
		} finally {
			busy = false;
		}
	}

	const note: Partial<Record<string, string>> = {
		insecure: 'Push to this device needs Waterline on HTTPS. ntfy, below, works either way.',
		ios: 'On iPhone and iPad, add Waterline to your Home Screen first (Share › Add to Home Screen), then open it from there and turn this on.',
		unsupported: "This browser can't get push notifications. ntfy, below, works on any phone.",
		denied: "Notifications are blocked for Waterline in this browser. Allow them in the browser's site settings, then come back here."
	};
	const any = $derived(push.devices.length > 0 || !!push.ntfyUrl);
	let showToken = $state(false);
</script>

<div id="push" class="push">
	<h3 class="sub-h" id="push-h">Push to your phone</h3>
	<div class="group" role="group" aria-labelledby="push-h">
		<div class="row stack this">
			<div class="line">
				<span class="ttext"
					><span class="tt">This device</span><span class="td" aria-live="polite"
						>{#if mode === 'on'}✓ Gets notifications{:else if note[mode]}{note[mode]}{:else if mode === 'checking'}Checking…{:else}Reminders and alerts as notifications, even when Waterline is closed.{/if}</span
					></span
				>
				{#if mode === 'off'}
					<button type="button" class="btn btn-primary sm" disabled={busy} onclick={turnOn}>Turn on</button>
				{:else if mode === 'on'}
					<button type="button" class="btn sm" disabled={busy} onclick={turnOff}>Turn off</button>
				{/if}
			</div>
			<noscript><span class="td">Turning on push for a device needs JavaScript. ntfy, below, doesn't.</span></noscript>
		</div>

		{#each push.devices as d (d.id)}
			<form method="POST" action="?/pushRemove" class="row device" use:enhance>
				<input type="hidden" name="id" value={d.id} />
				<span class="ttext"
					><span class="tt">{d.label}{#if d.endpoint === mine}<span class="badge">This device</span>{/if}</span><span class="td"
						>Added {fmtDate(dateInZone(d.createdAt, timeZone))}{d.lastSentAt ? ` · last notified ${fmtDate(dateInZone(d.lastSentAt, timeZone))}` : ''}</span
					></span
				>
				<button class="btn-text remove">Remove<span class="sr-only"> {d.label}</span></button>
			</form>
		{/each}

		<form method="POST" action="?/ntfy" class="row stack" use:enhance={() => async ({ update }) => update({ reset: false })}>
			<label class="ttext" for="ntfy-url"
				><span class="tt">ntfy</span><span class="td"
					>Or get them in the <a href="https://ntfy.sh" target="_blank" rel="noopener noreferrer">ntfy app<span aria-hidden="true"> ↗</span></a>, on
					ntfy.sh or your own ntfy server: subscribe to a topic there and paste its address here.</span
				></label
			>
			<input
				id="ntfy-url"
				class="input"
				name="ntfyUrl"
				type="url"
				inputmode="url"
				autocomplete="off"
				spellcheck="false"
				placeholder="https://ntfy.sh/your-private-topic"
				value={typedUrl ?? push.ntfyUrl ?? ''}
				aria-describedby="ntfy-hint{ntfyError ? ' ntfy-err' : ''}"
				aria-invalid={ntfyError ? 'true' : undefined}
			/>
			{#if ntfyError}<p id="ntfy-err" class="error-text status-bad">✕ {ntfyError}</p>{/if}
			<p id="ntfy-hint" class="hint">Pick a long topic name no one would guess: anyone who knows it can read what's sent to it.</p>
			{#if showToken || push.ntfyToken}
				<label class="field-l" for="ntfy-token">Access token{push.ntfyToken ? ' (saved; enter a new one to replace it)' : ''}</label>
				<input id="ntfy-token" class="input" name="ntfyToken" type="password" autocomplete="off" placeholder={push.ntfyToken ? '••••••••' : 'tk_…'} />
				{#if push.ntfyToken}<label class="check-row"><input type="checkbox" name="clearToken" /> Remove the saved token</label>{/if}
			{:else}
				<button type="button" class="btn-text self-start" onclick={() => (showToken = true)}>My ntfy server needs an access token</button>
				<noscript><label class="field-l" for="ntfy-token-plain">Access token, if your ntfy server needs one</label><input id="ntfy-token-plain" class="input" name="ntfyToken" type="password" autocomplete="off" /></noscript>
			{/if}
			<div class="acts">
				<button class="btn btn-primary sm">{push.ntfyUrl ? 'Save' : 'Add ntfy'}</button>
				{#if push.ntfyUrl}<button class="btn-text muted" formaction="?/ntfyOff">Remove ntfy</button>{/if}
			</div>
		</form>
	</div>

	{#if any}
		<form method="POST" action="?/pushTest" class="test" use:enhance={() => async ({ update }) => update({ reset: false })}>
			<button class="btn">Send a test</button>
			{#if pushError}<p class="error-text status-bad" role="alert">{pushError}</p>{/if}
		</form>
	{/if}
</div>

<style>
	.push {
		display: flex;
		flex-direction: column;
		gap: 10px;
		scroll-margin-top: 16px;
	}
	.sub-h {
		margin: 8px 0 0;
		font-size: 15px;
		font-weight: 600;
	}
	.group {
		display: flex;
		flex-direction: column;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 12px 16px;
	}
	.row + .row {
		border-top: 1px solid var(--border);
	}
	.stack {
		flex-direction: column;
		align-items: stretch;
		gap: 10px;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.ttext {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.tt {
		font-size: 16px;
		color: var(--text);
	}
	.td {
		font-size: 13px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.td a {
		font-weight: 600;
	}
	.badge {
		margin-left: 8px;
		padding: 1px 6px;
		border-radius: 5px;
		border: 1px solid var(--border-strong);
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		vertical-align: 1px;
	}
	.btn.sm {
		flex-shrink: 0;
		height: 44px;
		padding: 0 16px;
		font-size: 15px;
	}
	.remove {
		flex-shrink: 0;
		min-height: 44px;
		color: var(--bad);
		font-weight: 600;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
	}
	.error-text {
		margin: 0;
		font-size: 14px;
	}
	.field-l {
		font-size: 14px;
		color: var(--text-2);
	}
	.self-start {
		align-self: flex-start;
		min-height: 44px;
		padding-left: 0;
		padding-right: 0;
		font-weight: 600;
	}
	.acts {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.muted {
		min-height: 44px;
		padding-left: 0;
		padding-right: 0;
		color: var(--text-muted);
	}
	.test {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.test .btn {
		align-self: flex-start;
		height: 44px;
		padding: 0 18px;
	}
	@media (min-width: 1024px) {
		.row {
			padding: 14px 18px;
		}
	}
</style>
