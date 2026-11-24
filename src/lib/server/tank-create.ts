import { rememberOptions, TANK_COOKIE } from '$lib/remember';
import { redirect, type RequestEvent } from '@sveltejs/kit';
import { setFlash } from './flash';
import { formValues, parseTankForm, refuse } from './forms';
import { createTank } from './tanks';

/** Shared action for setup step 2 and /tanks/new. */
export async function createTankAction({ request, locals, cookies }: RequestEvent) {
	const user = locals.user!;
	const form = await request.formData();
	const { errors, values } = parseTankForm(form, user);
	if (Object.keys(errors).length) return refuse('tank', errors, formValues(form));
	const tank = createTank(user, values);
	cookies.set(TANK_COOKIE, tank.id, rememberOptions);
	setFlash(cookies, '✓ Tank created');
	redirect(303, `/?tank=${tank.id}`);
}
