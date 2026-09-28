// /tanks/current/<page>: that page of the tank you're on (the one the app
// shows, from the wl_tank cookie), for links that can't know its id, such as
// What's new's "your tank's Spending tab". No tank yet: the Tanks list.
// A page (not an endpoint), so links followed in the app come here too.
import { redirect } from '@sveltejs/kit';
import { listTanks } from '$lib/server/tanks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, cookies, params, url }) => {
	const tanks = listTanks(locals.user!.id);
	const id = tanks.find((t) => t.id === cookies.get('wl_tank'))?.id ?? tanks[0]?.id;
	if (!id) redirect(303, '/tanks');
	const rest = params.rest.split('/').filter(Boolean).map(encodeURIComponent).join('/');
	redirect(303, `/tanks/${id}${rest ? `/${rest}` : ''}${url.search}`);
};
