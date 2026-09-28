import { error, json } from '@sveltejs/kit';
import { searchSpecies } from '$lib/server/species';
import type { RequestHandler } from './$types';

// Species autocomplete (T5). Signed-in users only; the list is bundled.
export const GET: RequestHandler = ({ locals, url }) => {
	if (!locals.user) error(401);
	const water = url.searchParams.get('water');
	const kind = url.searchParams.get('kind');
	const results = searchSpecies(url.searchParams.get('q') ?? '', {
		water: water === 'fresh' || water === 'marine' ? water : undefined,
		kind: kind === 'fish' || kind === 'invert' || kind === 'coral' || kind === 'plant' || kind === 'animal' ? kind : undefined,
		limit: url.searchParams.get('many') ? 12 : 8
	});
	return json(results, { headers: { 'cache-control': 'private, max-age=3600' } });
};
