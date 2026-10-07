#!/usr/bin/env node
// npm audit for what the server runs (#101): fails on a high or critical
// advisory in a production dependency, unless it's in
// .github/security/npm-audit-allow.json with a reason and a date to look again.
// Dev tools (the build, tests) aren't shipped in the image, so they're left out.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BLOCKING = new Set(['high', 'critical']);
const allowFile = new URL('../.github/security/npm-audit-allow.json', import.meta.url);
/** @type {{ id: string; package: string; reason: string; until: string }[]} */
const allowed = JSON.parse(readFileSync(allowFile, 'utf8'));
const today = new Date().toISOString().slice(0, 10);

let out;
try {
	out = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
	// npm audit exits 1 when it finds anything; the report is still on stdout
	out = /** @type {{ stdout?: string }} */ (e).stdout;
	if (!out) throw e;
}
const report = JSON.parse(out);
if (report.error) {
	console.error(`npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);
	process.exit(2);
}

/** advisory id → what it is */
const found = new Map();
for (const v of Object.values(report.vulnerabilities ?? {})) {
	for (const via of v.via) {
		if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
		const id = String(via.url ?? via.source).split('/').pop();
		found.set(id, { id, package: via.name, severity: via.severity, title: via.title, url: via.url, range: via.range });
	}
}

let failed = false;
for (const a of allowed) {
	if (a.until < today) {
		console.error(`✕ ${a.id} (${a.package}) was allowed until ${a.until}: look at it again, then fix it or move the date with a reason`);
		failed = true;
	}
}
for (const f of found.values()) {
	const ok = allowed.find((a) => a.id === f.id);
	if (ok && ok.until >= today) {
		console.log(`– ${f.severity} ${f.id} in ${f.package}: allowed until ${ok.until}: ${ok.reason}`);
		continue;
	}
	console.error(`✕ ${f.severity} ${f.id} in ${f.package} ${f.range}: ${f.title}\n  ${f.url}`);
	failed = true;
}
if (failed) {
	console.error('\nFix with `npm audit fix` (or update the package), or, if it can\'t reach Waterline, list it in .github/security/npm-audit-allow.json with why.');
	process.exit(1);
}
console.log(`✓ No high or critical advisories in production dependencies (${report.metadata?.dependencies?.prod ?? '?'} packages).`);
