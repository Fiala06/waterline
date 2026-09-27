import { describe, expect, it, vi } from 'vitest';

// the checks only: no database
vi.mock('../db', () => ({ db: {} }));
const { isOurResource, validRedirectUri } = await import('./oauth');
const { bearerChallenge } = await import('./discovery');

describe('validRedirectUri', () => {
	it('takes https anywhere, and http only on this computer', () => {
		expect(validRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
		expect(validRedirectUri('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true);
		expect(validRedirectUri('http://127.0.0.1:33418/callback')).toBe(true);
		expect(validRedirectUri('http://localhost:6274/oauth/callback')).toBe(true);
		expect(validRedirectUri('http://[::1]:8080/cb')).toBe(true);
		expect(validRedirectUri('http://evil.example/cb')).toBe(false);
		expect(validRedirectUri('http://192.168.1.5/cb')).toBe(false);
	});

	it("takes an app's own scheme, never one that runs script", () => {
		expect(validRedirectUri('cursor://anysphere.cursor-mcp/oauth/callback')).toBe(true);
		for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'vbscript:x']) expect(validRedirectUri(bad)).toBe(false);
	});

	it('refuses fragments, junk and very long addresses', () => {
		expect(validRedirectUri('https://claude.ai/cb#x')).toBe(false);
		expect(validRedirectUri('not a url')).toBe(false);
		expect(validRedirectUri(42)).toBe(false);
		expect(validRedirectUri(`https://claude.ai/${'a'.repeat(2000)}`)).toBe(false);
	});
});

describe('isOurResource', () => {
	const origin = 'https://tanks.example.com';
	it('is this server, its MCP endpoint or its API', () => {
		expect(isOurResource('https://tanks.example.com', origin)).toBe(true);
		expect(isOurResource('https://tanks.example.com/mcp', origin)).toBe(true);
		expect(isOurResource('https://tanks.example.com/mcp/', origin)).toBe(true);
		expect(isOurResource('https://tanks.example.com/api/v1', origin)).toBe(true);
	});
	it('is never another server', () => {
		expect(isOurResource('https://tanks.example.com.evil.example/mcp', origin)).toBe(false);
		expect(isOurResource('https://evil.example/mcp', origin)).toBe(false);
		expect(isOurResource('https://tanks.example.com/other', origin)).toBe(false);
	});
});

describe('bearerChallenge', () => {
	it('points to the resource metadata, and says when a token failed', () => {
		expect(bearerChallenge('https://t.example', '/mcp', false)).toBe('Bearer resource_metadata="https://t.example/.well-known/oauth-protected-resource/mcp"');
		expect(bearerChallenge('https://t.example', '/mcp', true)).toContain('error="invalid_token"');
	});
});
