// The shape every assistant tool shares (#9), apart from the tools themselves
// so the tables in table-tools.ts and the rest in tools.ts can both use it.
import { displayValue, paramDecimals } from '$lib/params';
import type { TankParameter, User } from '../db/schema';
import type { AssistantAccess } from './tokens';

/** A problem the assistant can fix (a wrong id, a tank it can't see): shown to it as the tool's result. */
export class ToolError extends Error {}

export type ToolResult = { kind: 'json'; data: unknown } | { kind: 'text'; text: string } | { kind: 'image'; data: Buffer; mimeType: string; caption: string };

export type Args = Record<string, unknown>;

export interface Tool {
	name: string;
	title: string;
	description: string;
	inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
	run: (access: AssistantAccess, args: Args) => ToolResult | Promise<ToolResult>;
}

// ── Arguments the tools share ───────────────────────────────────────────────

/** The `days` argument's schema: how far back a tool looks. */
export const daysArg = (fallback: number, max: number) => ({
	type: 'integer',
	minimum: 1,
	maximum: max,
	description: `How many days back, up to ${max}. ${fallback} if left out.`
});

/** A whole number of days in range, or the fallback. */
export function days(args: Args, fallback: number, max: number) {
	const n = Number(args.days ?? fallback);
	return Number.isFinite(n) ? Math.min(max, Math.max(1, Math.round(n))) : fallback;
}

/** The instant n days ago, as stored (ISO, UTC). */
export const sinceDays = (n: number, now = Date.now()) => new Date(now - n * 86_400_000).toISOString();

/** A reading in the keeper's units, rounded as the app shows it (at least two decimals, so a chart loses nothing). */
export const shown = (p: TankParameter, v: number, user: User) => Number(displayValue(p, v, user).toFixed(Math.max(paramDecimals(p, user), 2)));
