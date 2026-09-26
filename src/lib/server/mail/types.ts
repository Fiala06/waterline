export interface MailMessage {
	to: string;
	subject: string;
	html: string;
	text: string;
	/** extra headers, e.g. List-Unsubscribe */
	headers?: Record<string, string>;
}

export interface Transport {
	send(from: string, msg: MailMessage): Promise<void>;
	/** "Mailgun (US) · mg.example.com", shown in the test email */
	describe: string;
}

/** Delivery failure with a message fit to show an admin. */
export class MailError extends Error {}
