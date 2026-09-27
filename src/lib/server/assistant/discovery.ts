// What an app reads to learn how to connect by signing in (#9): this server's
// MCP endpoint as an OAuth resource (RFC 9728) and its sign-in endpoints
// (RFC 8414). Anyone may read them, from any site.
import { json } from '@sveltejs/kit';
import { SCOPE } from './oauth';

export const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, POST, OPTIONS',
	'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version'
};
export const preflight = () => new Response(null, { status: 204, headers: { ...CORS, 'access-control-max-age': '86400' } });

export const resourceMetadataUrl = (origin: string, resource = '/mcp') => `${origin}/.well-known/oauth-protected-resource${resource}`;

/** "Bearer …" for a 401: where to learn how to sign in, and why this one failed. */
export function bearerChallenge(origin: string, resource: string, hadToken: boolean) {
	return `Bearer resource_metadata="${resourceMetadataUrl(origin, resource)}"${hadToken ? ', error="invalid_token"' : ''}`;
}

export function protectedResource(origin: string, path: string) {
	const resource = path.startsWith('api/v1') ? `${origin}/api/v1` : `${origin}/mcp`;
	return json(
		{
			resource,
			resource_name: 'Waterline',
			authorization_servers: [origin],
			scopes_supported: [SCOPE],
			bearer_methods_supported: ['header']
		},
		{ headers: { ...CORS, 'cache-control': 'max-age=3600' } }
	);
}

export function authorizationServer(origin: string) {
	return json(
		{
			issuer: origin,
			authorization_endpoint: `${origin}/oauth/authorize`,
			token_endpoint: `${origin}/oauth/token`,
			registration_endpoint: `${origin}/oauth/register`,
			scopes_supported: [SCOPE],
			response_types_supported: ['code'],
			response_modes_supported: ['query'],
			grant_types_supported: ['authorization_code', 'refresh_token'],
			code_challenge_methods_supported: ['S256'],
			token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
			authorization_response_iss_parameter_supported: true,
			service_documentation: 'https://github.com/Fiala06/waterline#ai-assistants-mcp'
		},
		{ headers: { ...CORS, 'cache-control': 'max-age=3600' } }
	);
}
