import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { prefsFor, unsubscribeAll } from '$lib/server/notifications';
import { verify } from '$lib/server/secrets';
import type { Actions, PageServerLoad } from './$types';

// "Unsubscribe from all". GET confirms; POST unsubscribes — including the
// RFC 8058 one-click POST that mail providers send (List-Unsubscribe-Post).
function userFor(token: string) {
	const id = verify(token, 'unsubscribe');
	return id ? db.select().from(users).where(eq(users.id, id)).get() : undefined;
}

export const load: PageServerLoad = ({ params }) => {
	const user = userFor(params.token);
	// the address the emails go to (which the link's holder already knows), not the sign-in email
	return { valid: !!user, email: user ? (prefsFor(user.id).notifyEmail || user.email).trim() : null };
};

export const actions: Actions = {
	default: ({ params }) => {
		const user = userFor(params.token);
		if (!user) return { done: false };
		unsubscribeAll(user.id);
		return { done: true };
	}
};
