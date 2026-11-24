// The address people open this server at, for links it hands out (invitations,
// shares, the sensor API): ORIGIN when it's set, else the address of this request.
import { env } from '$env/dynamic/private';

/** "https://tanks.example.com", with no trailing slash. */
export const appOrigin = (url: URL) => (env.ORIGIN || url.origin).replace(/\/+$/, '');
