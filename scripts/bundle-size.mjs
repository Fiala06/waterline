#!/usr/bin/env node
// The browser's JavaScript, against its budget (#110): all of it, gzipped,
// and the largest single file, after `npm run build`. Over `warn` is flagged,
// over `fail` exits 1. Budgets are in e2e/perf-budgets.json.
import { readFileSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const dir = '.svelte-kit/output/client';
const { bundle } = JSON.parse(readFileSync(new URL('../e2e/perf-budgets.json', import.meta.url), 'utf8'));
const files = [];
const walk = (d) => {
	for (const f of readdirSync(d)) {
		const p = join(d, f);
		if (statSync(p).isDirectory()) walk(p);
		else if (p.endsWith('.js')) files.push({ path: relative(dir, p), gz: gzipSync(readFileSync(p)).length });
	}
};
try {
	walk(dir);
} catch {
	console.error(`No build in ${dir}: run npm run build first.`);
	process.exit(2);
}
const kb = (n) => Math.round((n / 1024) * 10) / 10;
const total = kb(files.reduce((n, f) => n + f.gz, 0));
const largest = files.sort((a, b) => b.gz - a.gz)[0];
const flag = (v, b) => (v > b.fail ? '✕ over' : v > b.warn ? '▲ near' : '✓');
const lines = [
	'### Browser JavaScript (gzipped)',
	'',
	`- All of it: ${total} kB ${flag(total, bundle.totalGzKb)} (warn ${bundle.totalGzKb.warn}, fail ${bundle.totalGzKb.fail})`,
	`- Largest file: ${kb(largest.gz)} kB, ${largest.path} ${flag(kb(largest.gz), bundle.largestChunkGzKb)} (warn ${bundle.largestChunkGzKb.warn}, fail ${bundle.largestChunkGzKb.fail})`
];
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
if (total > bundle.totalGzKb.fail || kb(largest.gz) > bundle.largestChunkGzKb.fail) process.exit(1);
