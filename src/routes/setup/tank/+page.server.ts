import { unitLabel } from '$lib/units';
import { createTankAction } from '$lib/server/tank-create';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({ volUnit: unitLabel('volume', locals.user!) });

export const actions: Actions = { default: createTankAction };
