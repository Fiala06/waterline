import { error } from '@sveltejs/kit';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { getExport } from '$lib/server/export';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, params }) => {
	const e = getExport(locals.user!.id, params.id);
	if (e.status !== 'ready' || !e.filePath || (e.expiresAt && e.expiresAt < new Date().toISOString())) {
		error(410, 'This export has expired. Build a new one.');
	}
	const size = statSync(e.filePath).size;
	return new Response(Readable.toWeb(createReadStream(e.filePath)) as ReadableStream, {
		headers: {
			'content-type': e.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/zip',
			'content-length': String(size),
			'content-disposition': `attachment; filename="${e.fileName}"`,
			'cache-control': 'private, no-store'
		}
	});
};
