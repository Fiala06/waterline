// The shape every assistant tool shares (#9), apart from the tools themselves
// so the tables in table-tools.ts and the rest in tools.ts can both use it.
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
