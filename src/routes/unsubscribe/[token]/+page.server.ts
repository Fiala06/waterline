import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { unsubscribeAll } from '$lib/server/notifications';
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
	return { valid: !!user, email: user?.email ?? null };
};

export const actions: Actions = {
	default: ({ params }) => {
		const user = userFor(params.token);
		if (!user) return { done: false };
		unsubscribeAll(user.id);
		return { done: true };
	}
};
