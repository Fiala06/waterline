// Text search folding (#312): lower case, accents and other marks gone, so
// "jäger", "JAGER" and "Jäger" are one word. The database uses the same
// function (wl_fold, registered in $lib/server/db) so a search is done in SQL.

export function fold(s: string): string {
	return s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
}

/** The search box's text, tidied: trimmed, spaces squeezed, at most 80 characters; '' for none. */
export function searchTerm(v: string | null | undefined): string {
	return (v ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** A LIKE pattern for a folded term, with % and _ taken literally (ESCAPE '\'). */
export function likePattern(term: string): string {
	return `%${fold(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
