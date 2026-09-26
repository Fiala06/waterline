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
			csrf: { trustedOrigins: ['*'] }
		})
	],
	test: {
		include: ['src/**/*.test.ts']
	}
});
