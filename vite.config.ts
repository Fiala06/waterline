import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Origin checks are done in hooks.server.ts, so one-click unsubscribe
			// (a cross-site POST from mail providers) can be allowed.
			csrf: { trustedOrigins: ['*'] },
			// Content Security Policy: scripts only from here (SvelteKit's own inline ones get a
			// nonce) and Google's tag when GA4 is on; styles may be inline (Svelte sets style
			// attributes); images from here, previews (blob:) and GA's beacons; nothing framed.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self', 'https://www.googletagmanager.com'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:', 'https://*.google-analytics.com', 'https://www.googletagmanager.com'],
					'connect-src': ['self', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com'],
					'font-src': ['self'],
					'worker-src': ['self'],
					'manifest-src': ['self'],
					'frame-ancestors': ['none'],
					'base-uri': ['self'],
					'object-src': ['none']
				}
			}
		})
	],
	test: {
		include: ['src/**/*.test.ts']
	}
});
