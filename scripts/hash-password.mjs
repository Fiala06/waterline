// Prints a LOCAL_ADMIN_PASSWORD_HASH value.
//   npm run hash-password           asks for the password (typing stays hidden)
//   hash-password                   the same, inside the Docker container
//   npm run hash-password -- 'pw'   takes it as an argument instead
import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline';

async function askTwice() {
	const tty = Boolean(process.stdin.isTTY);
	// Prompts go to stderr so stdout is only the hash.
	const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: tty });
	if (tty) rl._writeToOutput = () => {}; // don't echo what's typed
	const lines = rl[Symbol.asyncIterator]();
	const ask = async (q) => {
		process.stderr.write(q);
		const { value } = await lines.next();
		if (tty) process.stderr.write('\n');
		return value ?? '';
	};
	const first = await ask('Password: ');
	const second = await ask('Again: ');
	rl.close();
	if (first !== second) fail("The passwords don't match.");
	return first;
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

const password = process.argv[2] ?? (await askTwice());
if (!password) fail('The password is empty.');
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
console.log(`scrypt:${salt.toString('base64')}:${hash.toString('base64')}`);
