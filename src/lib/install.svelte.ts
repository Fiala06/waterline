// "Add to home screen": holds the browser's install prompt so both the
// install card and Settings › Install app can use it.
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
export const install = $state({ available: false, installed: false, ios: false });

export function isStandalone() {
	return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

let listening = false;
export function listenForInstall() {
	if (listening || typeof window === 'undefined') return;
	listening = true;
	install.installed = isStandalone();
	install.ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault();
		deferred = e as BeforeInstallPromptEvent;
		install.available = true;
	});
	window.addEventListener('appinstalled', () => {
		install.installed = true;
		install.available = false;
	});
}

/** Show the browser's install dialog. Returns the outcome, or null if it isn't available. */
export async function promptInstall() {
	if (!deferred) return null;
	await deferred.prompt();
	const { outcome } = await deferred.userChoice;
	deferred = null;
	install.available = false;
	return outcome;
}
