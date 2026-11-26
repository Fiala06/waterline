import { findPublic } from '$lib/server/public';
import { serveSpeciesPhoto, tankSpeciesNames } from '$lib/server/public-species';
import type { RequestHandler } from './$types';

// A species photo on a public tank page: only the tank's own species.
export const GET: RequestHandler = ({ params }) => {
	const { page, tank } = findPublic(params.slug);
	return serveSpeciesPhoto(tankSpeciesNames(page, tank), params.file);
};
