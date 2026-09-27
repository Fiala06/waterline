import { receiptOf } from '$lib/server/expenses';
import type { RequestHandler } from './$types';

/** An expense's receipt, a photo or a PDF, only for its owner (#8). */
export const GET: RequestHandler = ({ locals, params }) => {
	const r = receiptOf(locals.user!.id, params.eid);
	const name = `receipt-${r.expense.date}.${r.type === 'application/pdf' ? 'pdf' : 'jpg'}`;
	return new Response(new Uint8Array(r.body), {
		headers: {
			'content-type': r.type,
			'content-disposition': `inline; filename="${name}"`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
