import { findPublic, publicPhoto } from '$lib/server/public';
import { servePhoto } from '$lib/server/public-files';
import type { RequestHandler } from './$types';

// Photos on a public tank page.
export const GET: RequestHandler = ({ params, url }) => {
	const { page, tank } = findPublic(params.slug);
	return servePhoto(publicPhoto(page, tank, params.photo), url.searchParams.get('size') === 'thumb' ? 'thumb' : 'full');
};
