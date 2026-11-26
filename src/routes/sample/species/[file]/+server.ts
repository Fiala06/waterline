import { error } from '@sveltejs/kit';
import { publicRanges, publicSettings } from '$lib/server/public';
import { serveSpeciesPhoto } from '$lib/server/public-species';
import { sampleTank } from '$lib/server/sample-tank';
import type { RequestHandler } from './$types';

// A species photo on the sample tank (#301): only its own species.
export const GET: RequestHandler = ({ params, url }) => {
	if (!publicSettings().sampleEnabled) error(404, 'Not found');
	const { detail } = sampleTank(publicRanges(url));
	const names = [...detail.animals, ...detail.plants].map((x) => x.lookup).filter((n): n is string => !!n);
	return serveSpeciesPhoto(names, params.file);
};
