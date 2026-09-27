import { authorizationServer, preflight } from '$lib/server/assistant/discovery';
import type { RequestHandler } from './$types';

// /.well-known/oauth-authorization-server (RFC 8414)
export const GET: RequestHandler = ({ url }) => authorizationServer(url.origin);
export const OPTIONS: RequestHandler = preflight;
