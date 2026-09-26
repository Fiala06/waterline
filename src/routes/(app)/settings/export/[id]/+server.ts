import { json } from '@sveltejs/kit';
import { getExport } from '$lib/server/export';
import type { RequestHandler } from './$types';

// Progress for the export page to poll.
export const GET: RequestHandler = ({ locals, params }) => {
	const e = getExport(locals.user!.id, params.id);
	return json({ status: e.status, progress: e.progress, progressText: e.progressText });
};
