import { severalAction, severalLoad } from '$lib/server/add-several';
import type { Actions, PageServerLoad } from './$types';

// Add several livestock at once, picked from the species list.
export const load: PageServerLoad = severalLoad;
export const actions: Actions = { default: severalAction('livestock') };
