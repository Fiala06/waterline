import type { User } from '$lib/server/db/schema';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
		}
		interface Error {
			message: string;
			/** for an unexpected error: its entry in Server settings › Logs */
			ref?: string;
		}
	}
}

export {};
