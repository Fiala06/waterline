import { error, text } from '@sveltejs/kit';
import { plugReported } from '$lib/server/plugs';
import type { RequestHandler } from './$types';

// A smart plug reporting that it switched (#205): the webhooks Waterline sets
// up on a linked Shelly plug call /plug-hook/<token>/on and /off. The token is
// the plug's own secret, made when it was linked; nothing else is taken from
// the request.
const handle: RequestHandler = ({ params }) => {
	if (params.state !== 'on' && params.state !== 'off') error(404, 'Not found');
	if (!/^[0-9a-f]{48}$/.test(params.token) || !plugReported(params.token, params.state === 'on')) error(404, 'Not found');
	return text('ok', { headers: { 'cache-control': 'no-store' } });
};

export const GET = handle;
export const POST = handle;
