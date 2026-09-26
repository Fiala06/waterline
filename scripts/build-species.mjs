// Builds the bundled species list used for livestock/plant autocomplete.
//
//   npm run build:species
//
// Which species are included, and their hobby common names, come from
// Wikipedia's aquarium species lists (CC BY-SA 4.0). Wikidata (CC0) fills in
// common names Wikipedia doesn't give. See src/lib/server/data/SPECIES_SOURCES.md.
import { writeFileSync } from 'node:fs';

const UA = 'WaterlineSpeciesBuilder/1.0 (https://github.com/Fiala06/waterline)';
const OUT = new URL('../src/lib/server/data/species.json', import.meta.url);

/** Wikipedia list → what the species are. kind: fish | invert | coral | plant; water: fresh | marine */
const SOURCES = [
	{ page: 'List of freshwater aquarium fish species', kind: 'fish', water: 'fresh' },
	{ page: 'List of marine aquarium fish species', kind: 'fish', water: 'marine' },
	{ page: 'List of freshwater aquarium invertebrate species', kind: 'invert', water: 'fresh' },
	{ page: 'List of marine aquarium invertebrate species', kind: 'invert', water: 'marine' },
	{ page: 'List of freshwater aquarium plant species', kind: 'plant', water: 'fresh' }
];

// Coral genera, to split corals out of the marine invertebrate list.
const CORAL_GENERA = new Set(
	`Acropora Montipora Pocillopora Seriatopora Stylophora Euphyllia Fungia Goniopora Porites
	Trachyphyllia Catalaphyllia Plerogyra Duncanopsammia Turbinaria Favia Lobophyllia Blastomussa
	Caulastrea Galaxea Pavona Heliofungia Tubastraea Sarcophyton Sinularia Lobophytum Xenia
	Heteroxenia Clavularia Pachyclavularia Briareum Zoanthus Palythoa Discosoma Rhodactis Ricordea
	Actinodiscus Capnella Cladiella Nephthea Litophyton Dendronephthya Gorgonia Pseudopterogorgia
	Tubipora Heliopora Cynarina Scolymia Acanthastrea Echinopora Merulina Hydnophora Leptastrea
	Platygyra Diploria Pectinia Physogyra Alveopora Cycloseris Herpolitha Polyphyllia Micromussa
	Mussa Dendrogyra Montastraea Cladocora Symphyllia Echinophyllia Oxypora Mycedium Anacropora
	Isopora Astreopora Goniastrea Leptoseris Coscinaraea`.split(/\s+/)
);

// ''[[Genus species]]'', ''[[Target|Genus species]]'' or ''[[Genus species]] var. x''
const BINOMIAL = /''\[\[(?:[^\]|]*\|)?([A-Z][a-z]+ [a-z][a-z-]+)(?=\]\]|[ |])/;
const skipName = (n) => / (sp|spp|cf|aff|var|x)$/.test(n);

async function wikitext(page) {
	const u = new URL('https://en.wikipedia.org/w/api.php');
	u.search = new URLSearchParams({ action: 'parse', page, prop: 'wikitext|revid', format: 'json', redirects: '1' });
	const r = await fetch(u, { headers: { 'User-Agent': UA } });
	if (!r.ok) throw new Error(`${page}: HTTP ${r.status}`);
	const d = await r.json();
	return { text: d.parse.wikitext['*'], revid: d.parse.revid };
}

/** Wikitext → plain text: drop refs, templates, files, cell attributes; keep link text. */
function plain(s) {
	let t = s
		.replace(/<ref[^>]*\/>/g, '')
		.replace(/<ref[\s\S]*?<\/ref>/g, '')
		.replace(/\{\{[^{}]*\}\}/g, '')
		.replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '')
		.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
		.replace(/'{2,}/g, '')
		.replace(/<[^>]+>/g, '');
	// "align=center | text" → "text"
	const bar = t.indexOf('|');
	if (bar >= 0 && /(align|style|class|width|rowspan|colspan)\s*=/.test(t.slice(0, bar))) t = t.slice(bar + 1);
	return t.trim();
}

function commonFrom(cell) {
	const t = plain(cell).replace(/\s*\([^)]*\)\s*/g, ' ').trim();
	if (!t || /^(none|\?|-|—|n\/a)$/i.test(t)) return [];
	return t
		.split(/\s*[,;/]\s*|\s+or\s+/)
		.map((x) => x.replace(/["“”]/g, '').trim())
		.filter((x) => x.length > 2 && x.length < 50 && !/[{}[\]=|]/.test(x));
}

/**
 * Species and their Wikipedia common names. Handles tables with a
 * "Common name" column and bullet lists ("* ''[[Genus species]]'', Common name").
 */
function parseList(text) {
	const out = new Map(); // name → common names
	const add = (name, common) => {
		if (skipName(name)) return;
		const prev = out.get(name) ?? [];
		out.set(name, [...prev, ...common.filter((c) => !prev.includes(c))]);
	};

	for (const table of text.split(/\n\{\|/).slice(1)) {
		const body = table.split(/\n\|\}/)[0];
		const parts = body.split(/\n\|-[^\n]*/);
		// Header cells ("!") can sit before or after the first row separator.
		const headerLines = parts.flatMap((p) => p.split('\n').filter((l) => l.startsWith('!')));
		const rows = parts.filter((p) => !p.trim().startsWith('!'));
		const headers = headerLines.flatMap((l) => l.slice(1).split('!!')).map((h) => plain(h).toLowerCase());
		const commonCol = headers.findIndex((h) => h.startsWith('common name'));
		for (const row of rows) {
			const cells = row
				.replace(/^\n\|?/, '')
				.split(/\n\||\|\|/)
				.map((c) => c.trim());
			const sci = cells.find((c) => BINOMIAL.test(c));
			if (!sci) continue;
			add(sci.match(BINOMIAL)[1], commonCol >= 0 && cells[commonCol] ? commonFrom(cells[commonCol]) : []);
		}
	}

	for (const line of text.split('\n')) {
		if (!line.startsWith('*')) continue;
		const m = line.match(BINOMIAL);
		if (!m) continue;
		const close = line.indexOf("]]''", line.indexOf(m[0]));
		const rest = close >= 0 ? line.slice(close + 4) : '';
		add(m[1], rest.trim().startsWith(',') ? commonFrom(rest.trim().slice(1)) : []);
	}
	return out;
}

async function sparql(query) {
	const u = new URL('https://query.wikidata.org/sparql');
	u.search = new URLSearchParams({ query, format: 'json' });
	for (let attempt = 0; attempt < 4; attempt++) {
		const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
		if (r.ok) return (await r.json()).results.bindings;
		await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
	}
	throw new Error('Wikidata query failed');
}

/** Scientific name → English common names from Wikidata (P1843 taxon common name, then label). */
async function wikidataNames(names) {
	const found = new Map();
	const list = [...names];
	for (let i = 0; i < list.length; i += 150) {
		const values = list
			.slice(i, i + 150)
			.map((n) => `"${n}"`)
			.join(' ');
		const rows = await sparql(`
			SELECT ?name ?common ?label WHERE {
				VALUES ?name { ${values} }
				?taxon wdt:P225 ?name .
				OPTIONAL { ?taxon wdt:P1843 ?common . FILTER(LANG(?common) = "en") }
				OPTIONAL { ?taxon rdfs:label ?label . FILTER(LANG(?label) = "en") }
			}`);
		for (const r of rows) {
			const name = r.name.value;
			const entry = found.get(name) ?? { common: new Set(), label: null };
			if (r.common) entry.common.add(r.common.value);
			if (r.label && r.label.value !== name) entry.label = r.label.value;
			found.set(name, entry);
		}
		await new Promise((res) => setTimeout(res, 500));
	}
	return found;
}

const tidy = (s) => s.trim().replace(/\s+/g, ' ');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const species = new Map();
const sources = [];
for (const src of SOURCES) {
	const { text, revid } = await wikitext(src.page);
	sources.push({ page: src.page, revid, url: `https://en.wikipedia.org/w/index.php?oldid=${revid}` });
	const parsed = parseList(text);
	console.log(`${src.page}: ${parsed.size} species`);
	for (const [n, common] of parsed) {
		const existing = species.get(n);
		if (existing) {
			existing.wp.push(...common);
			continue;
		}
		const kind = src.kind === 'invert' && CORAL_GENERA.has(n.split(' ')[0]) ? 'coral' : src.kind;
		species.set(n, { s: n, kind, water: src.water, wp: common });
	}
}

const wd = await wikidataNames(species.keys());
for (const [n, sp] of species) {
	const w = wd.get(n);
	const all = [...sp.wp, ...(w ? [...w.common] : [])].map(tidy);
	if (!all.length && w?.label) all.push(tidy(w.label));
	const seen = new Set();
	sp.c = all
		.filter((c) => {
			const k = c.toLowerCase();
			if (k === n.toLowerCase() || seen.has(k)) return false;
			seen.add(k);
			return true;
		})
		.slice(0, 3)
		.map(cap);
	delete sp.wp;
}

const list = [...species.values()].sort((a, b) => a.s.localeCompare(b.s));
writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), sources, species: list }) + '\n');
console.log(`Wrote ${list.length} species (${list.filter((s) => s.c.length).length} with common names)`);
