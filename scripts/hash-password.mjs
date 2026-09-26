// Prints a LOCAL_ADMIN_PASSWORD_HASH value. Usage: npm run hash-password -- 'my password'
import { randomBytes, scryptSync } from 'node:crypto';

const password = process.argv[2];
if (!password) {
	console.error("Usage: npm run hash-password -- 'your password'");
	process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
console.log(`scrypt:${salt.toString('base64')}:${hash.toString('base64')}`);
