import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { setFlash } from './flash';
import { parseTankForm } from './forms';
import { createTank } from './tanks';

/** Shared action for setup step 2 and /tanks/new. */
export async function createTankAction({ request, locals, cookies }: RequestEvent) {
	const user = locals.user!;
	const form = await request.formData();
	const { errors, values } = parseTankForm(form, user);
	if (Object.keys(errors).length) {
		return fail(400, { errors, values: Object.fromEntries([...form].map(([k, v]) => [k, String(v)])) });
	}
	const tank = createTank(user, values);
	cookies.set('wl_tank', tank.id, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 31536000 });
	setFlash(cookies, '✓ Tank created');
	redirect(303, `/?tank=${tank.id}`);
}
