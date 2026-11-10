// Connecting an assistant by signing in (#9, OAuth 2.1 as MCP asks for it), for
// apps like claude.ai and ChatGPT that can't take a pasted token. The app
// registers itself, sends the keeper here to sign in and pick tanks, and gets
// a one-time code it swaps for an hour's access token plus a refresh token.
// PKCE (S256) always; redirect addresses must match exactly.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, inArray, isNotNull, isNull, lt, notExists, or } from 'drizzle-orm';
import { db } from '../db';
import { assistantTokens, oauthClients, oauthCodes, type OAuthClient } from '../db/schema';
import { hash, newToken, ownTanks } from './tokens';
import { logger } from '../log';
import { getUser, maySignIn } from '../users';

export const SCOPE = 'read';
const ACCESS_TTL_S = 3600;
const REFRESH_TTL_DAYS = 60;
const CODE_TTL_MS = 10 * 60_000;
const MAX_REDIRECTS = 10;

export class OAuthError extends Error {
	constructor(
		public code: string,
		message: string,
		public status = 400
	) {
		super(message);
	}
}

const iso = (ms: number) => new Date(ms).toISOString();

const NOT_AN_APP = ['javascript', 'data', 'file', 'vbscript', 'blob', 'about', 'ftp', 'ws', 'wss', 'intent', 'tel', 'sms', 'mailto', 'market', 'itms', 'itms-apps', 'view-source', 'chrome', 'edge'];

/**
 * Where an app may be sent back to: https anywhere, http only on this
 * computer (apps on the desktop), or an app's own scheme; never one that runs
 * script, and no fragment.
 */
export function validRedirectUri(value: unknown): value is string {
	if (typeof value !== 'string' || value.length > 2000) return false;
	let u: URL;
	try {
		u = new URL(value);
	} catch {
		return false;
	}
	if (u.hash) return false;
	const scheme = u.protocol.slice(0, -1);
	if (scheme === 'https') return !!u.hostname;
	if (scheme === 'http') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
	// an app's own scheme (cursor://, vscode://), never one the device itself acts on: a call, a message, another app's launcher
	return /^[a-z][a-z0-9+.-]*$/.test(scheme) && !NOT_AN_APP.includes(scheme) && !scheme.startsWith('ms-');
}

// ── Registration (RFC 7591) ─────────────────────────────────────────────────

const AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'] as const;

/** Apps that may register in an hour, from everywhere together, and how many that never connected are kept (#215). */
export const REGISTRATIONS_AN_HOUR = 200;
export const MAX_UNCONNECTED = 500;

const unconnected = () =>
	and(
		notExists(db.select().from(assistantTokens).where(eq(assistantTokens.clientId, oauthClients.id))),
		notExists(db.select().from(oauthCodes).where(eq(oauthCodes.clientId, oauthClients.id)))
	);

/** Registered apps nobody connected are only kept so many deep: the oldest make room for a new one. */
function trimUnconnected() {
	const rows = db.select({ id: oauthClients.id }).from(oauthClients).where(unconnected()).orderBy(desc(oauthClients.createdAt), desc(oauthClients.id)).all();
	const extra = rows.slice(MAX_UNCONNECTED - 1).map((r) => r.id);
	if (extra.length) db.delete(oauthClients).where(inArray(oauthClients.id, extra)).run();
}

/** An app registers itself; the answer is what it needs to use. */
export function registerClient(body: unknown) {
	const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
	const uris = b.redirect_uris;
	if (!Array.isArray(uris) || !uris.length || uris.length > MAX_REDIRECTS || !uris.every(validRedirectUri)) {
		throw new OAuthError('invalid_redirect_uri', 'redirect_uris must be 1 to 10 https addresses (or http on localhost), without a fragment.');
	}
	// public apps prove themselves with PKCE; an app that asks for a secret gets one
	const method = (b.token_endpoint_auth_method ?? 'none') as string;
	if (!(AUTH_METHODS as readonly string[]).includes(method)) throw new OAuthError('invalid_client_metadata', `token_endpoint_auth_method must be one of ${AUTH_METHODS.join(', ')}.`);
	const grants = (b.grant_types ?? ['authorization_code']) as unknown;
	if (!Array.isArray(grants) || !grants.includes('authorization_code') || grants.some((g) => g !== 'authorization_code' && g !== 'refresh_token')) {
		throw new OAuthError('invalid_client_metadata', 'grant_types may be authorization_code and refresh_token.');
	}
	const name = (typeof b.client_name === 'string' ? b.client_name : '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'AI assistant';
	const secret = method === 'none' ? null : randomBytes(32).toString('base64url');
	trimUnconnected();
	const client = db
		.insert(oauthClients)
		.values({ id: `wlc_${randomBytes(16).toString('base64url')}`, name, redirectUris: [...new Set(uris as string[])], secretHash: secret ? hash(secret) : null })
		.returning()
		.get();
	return {
		client_id: client.id,
		client_id_issued_at: Math.floor(Date.parse(client.createdAt) / 1000),
		client_name: client.name,
		redirect_uris: client.redirectUris,
		grant_types: ['authorization_code', 'refresh_token'],
		response_types: ['code'],
		token_endpoint_auth_method: method,
		scope: SCOPE,
		...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {})
	};
}

export const getClient = (id: string | null | undefined): OAuthClient | undefined =>
	id ? db.select().from(oauthClients).where(eq(oauthClients.id, id)).get() : undefined;

// ── The consent page's request ──────────────────────────────────────────────

export interface AuthorizeRequest {
	client: OAuthClient;
	redirectUri: string;
	state: string | null;
	codeChallenge: string;
}

/**
 * Checks /oauth/authorize's query. Whatever is wrong with it is shown on the
 * page, never sent back by redirect (#219): apps register themselves, so "the
 * app's own address" is whatever anyone says it is, and a link that bounced
 * straight there would make this server a trusted-looking hop to it. The only
 * redirects are the keeper's own Allow and Cancel.
 */
export function readAuthorize(q: URLSearchParams, origin: string): { ok: AuthorizeRequest } | { page: string } {
	const client = getClient(q.get('client_id'));
	if (!client) return { page: "This app isn't registered with Waterline. Try connecting it again." };
	const redirectUri = q.get('redirect_uri') ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : '');
	if (!client.redirectUris.includes(redirectUri)) return { page: "This app asked to return to an address it didn't register, so Waterline stopped here." };
	const state = q.get('state');
	const to = new URL(redirectUri).host || redirectUri.split(':')[0];
	const back = (_error: string, description: string) => ({ page: `${client.name} sent a request Waterline can't use: ${description} You haven't been sent on to ${to}. Try connecting it again from the app.` });
	if (q.get('response_type') !== 'code') return back('unsupported_response_type', 'Only response_type=code is supported.');
	const challenge = q.get('code_challenge') ?? '';
	if (q.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9._~-]{43,128}$/.test(challenge)) {
		return back('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
	}
	const scope = q.get('scope');
	if (scope && !scope.split(' ').every((s) => s === SCOPE || s === '')) return back('invalid_scope', `The only scope is "${SCOPE}".`);
	const resource = q.get('resource');
	if (resource && !isOurResource(resource, origin)) return back('invalid_target', 'That resource is not this server.');
	return { ok: { client, redirectUri, state, codeChallenge: challenge } };
}

/** This server's MCP endpoint or API (RFC 8707 resource indicators). */
export function isOurResource(resource: string, origin: string) {
	const r = resource.replace(/\/+$/, '');
	return r === origin || r === `${origin}/mcp` || r.startsWith(`${origin}/api/v1`);
}

/** Allowed: a one-time code for the app, with the tanks the keeper picked. Returns where to send the browser. */
export function approve(userId: string, req: AuthorizeRequest, tankIds: string[], origin: string) {
	const code = randomBytes(32).toString('base64url');
	db.insert(oauthCodes)
		.values({
			codeHash: hash(code),
			clientId: req.client.id,
			userId,
			redirectUri: req.redirectUri,
			codeChallenge: req.codeChallenge,
			tankIds: ownTanks(userId, tankIds),
			expiresAt: iso(Date.now() + CODE_TTL_MS)
		})
		.run();
	const u = new URL(req.redirectUri);
	u.searchParams.set('code', code);
	if (req.state) u.searchParams.set('state', req.state);
	u.searchParams.set('iss', origin);
	return u.toString();
}

/** Declined: the app hears access_denied. */
export function deny(req: AuthorizeRequest, origin: string) {
	const u = new URL(req.redirectUri);
	u.searchParams.set('error', 'access_denied');
	u.searchParams.set('error_description', 'The keeper declined.');
	if (req.state) u.searchParams.set('state', req.state);
	u.searchParams.set('iss', origin);
	return u.toString();
}

// ── The token endpoint ──────────────────────────────────────────────────────

const pkceOk = (verifier: string, challenge: string) =>
	/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) && createHash('sha256').update(verifier).digest('base64url') === challenge;

function sameSecret(a: string, b: string) {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
}

/** The app, checked: its id, and its secret when it has one (in the form or Basic auth). */
export function authenticateClient(form: URLSearchParams, authorization: string | null): OAuthClient {
	let id = form.get('client_id');
	let secret = form.get('client_secret');
	const basic = /^Basic\s+(\S+)$/i.exec(authorization ?? '');
	if (basic) {
		const [u, p] = Buffer.from(basic[1], 'base64').toString().split(':');
		id = decodeURIComponent(u ?? '');
		secret = decodeURIComponent(p ?? '');
	}
	const client = getClient(id);
	if (!client) throw new OAuthError('invalid_client', 'Unknown client_id.', 401);
	if (client.secretHash && !(secret && sameSecret(hash(secret), client.secretHash))) throw new OAuthError('invalid_client', 'Wrong or missing client_secret.', 401);
	return client;
}

/** A locked-out keeper's apps get no new tokens (#209). */
function accountOpen(userId: string) {
	const u = getUser(userId);
	return !!u && maySignIn(u);
}

function tokenResponse(access: string, refresh: string) {
	return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: SCOPE };
}

/** grant_type=authorization_code: a new connection, as the keeper allowed it. */
export function exchangeCode(client: OAuthClient, form: URLSearchParams, origin: string, now = Date.now()) {
	const code = form.get('code') ?? '';
	const row = code ? db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, hash(code))).get() : undefined;
	if (!row || row.clientId !== client.id) throw new OAuthError('invalid_grant', 'Unknown code.');
	if (row.usedAt) throw new OAuthError('invalid_grant', 'That code was already used.');
	if (row.expiresAt <= iso(now)) throw new OAuthError('invalid_grant', 'That code has expired: sign in again.');
	const redirect = form.get('redirect_uri');
	if (redirect && redirect !== row.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri differs from the one used to sign in.');
	if (!pkceOk(form.get('code_verifier') ?? '', row.codeChallenge)) throw new OAuthError('invalid_grant', 'code_verifier does not match.');
	if (!accountOpen(row.userId)) throw new OAuthError('invalid_grant', 'That account can no longer sign in.');
	const resource = form.get('resource');
	if (resource && !isOurResource(resource, origin)) throw new OAuthError('invalid_target', 'That resource is not this server.');
	// single use, even if what follows fails
	const used = db.update(oauthCodes).set({ usedAt: iso(now) }).where(and(eq(oauthCodes.codeHash, row.codeHash), isNull(oauthCodes.usedAt))).run();
	if (!used.changes) throw new OAuthError('invalid_grant', 'That code was already used.');
	const access = newToken();
	const refresh = newToken('wlr_');
	db.insert(assistantTokens)
		.values({
			userId: row.userId,
			name: client.name,
			tokenHash: hash(access),
			hint: access.slice(-4),
			tankIds: ownTanks(row.userId, row.tankIds),
			clientId: client.id,
			expiresAt: iso(now + ACCESS_TTL_S * 1000),
			refreshHash: hash(refresh),
			refreshExpiresAt: iso(now + REFRESH_TTL_DAYS * 86_400_000)
		})
		.run();
	return tokenResponse(access, refresh);
}

/**
 * grant_type=refresh_token: new access and refresh tokens for the same
 * connection; the old refresh token stops working. A refresh token is spent
 * at most once (#100): the rotation only goes through while the row still
 * holds it, so of two refreshes with the same token one wins and the other
 * gets invalid_grant. A token that was already rotated away is a replay:
 * refused and logged (without the token), and the connection keeps working
 * for whoever holds the current one.
 */
export function refreshTokens(client: OAuthClient, form: URLSearchParams, now = Date.now()) {
	const refresh = form.get('refresh_token') ?? '';
	const spent = refresh ? hash(refresh) : '';
	const row = spent ? db.select().from(assistantTokens).where(eq(assistantTokens.refreshHash, spent)).get() : undefined;
	if (!row || row.clientId !== client.id) {
		const replayed = spent ? db.select({ id: assistantTokens.id, userId: assistantTokens.userId }).from(assistantTokens).where(eq(assistantTokens.prevRefreshHash, spent)).get() : undefined;
		if (replayed) logger.warn('assistant', 'A refresh token that was already used was used again', { userId: replayed.userId, connection: replayed.id, client: client.id });
		throw new OAuthError('invalid_grant', 'Unknown refresh token: connect again.');
	}
	if (!row.refreshExpiresAt || row.refreshExpiresAt <= iso(now)) throw new OAuthError('invalid_grant', 'The refresh token has expired: connect again.');
	if (!accountOpen(row.userId)) throw new OAuthError('invalid_grant', 'That account can no longer sign in.');
	const access = newToken();
	const next = newToken('wlr_');
	const swapped = db
		.update(assistantTokens)
		.set({
			tokenHash: hash(access),
			hint: access.slice(-4),
			expiresAt: iso(now + ACCESS_TTL_S * 1000),
			refreshHash: hash(next),
			refreshExpiresAt: iso(now + REFRESH_TTL_DAYS * 86_400_000),
			prevRefreshHash: spent
		})
		// compare and swap: only while this refresh token is still the current one
		.where(and(eq(assistantTokens.id, row.id), eq(assistantTokens.refreshHash, spent)))
		.run();
	if (swapped.changes !== 1) throw new OAuthError('invalid_grant', 'Unknown refresh token: connect again.');
	return tokenResponse(access, next);
}

/** Tidy up: used or old codes, connections whose refresh token ran out, and apps registered over a day ago that nobody is connected with. */
export function pruneOAuth(now = Date.now()) {
	db.delete(oauthCodes).where(or(lt(oauthCodes.expiresAt, iso(now)), isNotNull(oauthCodes.usedAt))).run();
	db.delete(assistantTokens).where(and(isNotNull(assistantTokens.clientId), lt(assistantTokens.refreshExpiresAt, iso(now)))).run();
	db.delete(oauthClients)
		.where(and(lt(oauthClients.createdAt, iso(now - 86_400_000)), unconnected()))
		.run();
}
