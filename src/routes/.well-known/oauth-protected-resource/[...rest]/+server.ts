import { preflight, protectedResource } from '$lib/server/assistant/discovery';
import type { RequestHandler } from './$types';

// /.well-known/oauth-protected-resource, and …/mcp or …/api/v1 after it (RFC 9728)
export const GET: RequestHandler = ({ url, params }) => protectedResource(url.origin, params.rest);
export const OPTIONS: RequestHandler = preflight;
