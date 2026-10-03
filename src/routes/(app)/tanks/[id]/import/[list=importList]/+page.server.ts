import { error, fail, redirect } from '@sveltejs/kit';
import { IMPORTS, importKindOf, isHistoryKind } from '$lib/imports';
import { fmtWhen, todayInZone } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { applyHistory, applyImport, historyContext, listImports, previewHistory, previewImport, undoImport, undoneText } from '$lib/server/import';
import { historyColumns, readHistory, trackedOnly } from '$lib/server/import-history';
import { columnMapOf, importColumns, validValue, wordMapOf, type FileColumn, type ImportValue, type LivestockValue } from '$lib/server/import-rows';
import { safeReturn } from '$lib/server/redirect';
import { getTank } from '$lib/server/tanks';
import type { Tank, User } from '$lib/server/db/schema';
import type { ImportKind } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';
import { logger } from '$lib/server/log';

const MAX_BYTES = 1_000_000;

/** The kind of import at this address (the matcher only lets real ones through). */
const kindOf = (slug: string) => importKindOf(slug) ?? error(404, 'Not found');

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const t = getTank(user.id, params.id, 'owner');
	const kind = kindOf(params.list);
	const columns = isHistoryKind(kind) ? historyColumns(kind, trackedOnly(historyContext(user, t))) : importColumns(kind, user);
	return {
		tank: { id: t.id, name: t.name },
		kind,
		columns: columns.map((c) => ({ header: c.header, help: c.help })),
		recent: listImports(user.id, t.id, kind).map((i) => ({
			id: i.id,
			summary: i.summary,
			fileName: i.fileName,
			when: fmtWhen(i.createdAt, user.timeZone),
			undone: !!i.undoneAt
		}))
	};
};

/** Spreadsheets save UTF-8; Excel on Windows can still save its own "ANSI" CSV. */
function decode(buf: ArrayBuffer) {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(buf);
	} catch {
		return new TextDecoder('windows-1252').decode(buf);
	}
}

/** One kind of line break, so the file reads the same when the page sends it back. */
const lf = (text: string) => text.replace(/\r\n?/g, '\n');

/** What a file's columns can be picked as: everything this kind of import reads. */
function columnChoices(kind: ImportKind, user: User, tank: Tank) {
	const cols = isHistoryKind(kind) ? historyColumns(kind, historyContext(user, tank)) : importColumns(kind, user);
	return cols.map((c) => ({ key: c.key, header: c.header }));
}

export const actions: Actions = {
	/** Read the file and show every row before anything is added. */
	check: async ({ request, locals, params }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'owner');
		const kind = kindOf(params.list);
		const form = await request.formData();
		// a new file, or the same one sent back with its columns picked by hand
		const again = form.get('csv');
		const file = form.get('file');
		let text: string;
		let name: string;
		if (typeof again === 'string') {
			if (again.length > MAX_BYTES) return fail(400, { error: 'That file is over 1 MB. Split it into smaller files.' });
			text = lf(again);
			name = str(form, 'fileName').slice(0, 200) || 'file.csv';
		} else {
			if (!(file instanceof File) || !file.size) return fail(400, { error: 'Choose a CSV file.' });
			if (file.size > MAX_BYTES) {
				logger.warn('import', `${file.name} is over 1 MB`, { userId: user.id, kind, size: file.size });
				return fail(400, { error: 'That file is over 1 MB. Split it into smaller files.' });
			}
			text = lf(decode(await file.arrayBuffer()));
			name = file.name;
		}
		const map = columnMapOf(form);
		// words a list's file uses that aren't known, as the keeper said to read them
		const preview = isHistoryKind(kind) ? previewHistory(kind, text, user, tank, map) : previewImport(kind, text, user, tank, map, wordMapOf(kind, form));
		const columns = columnChoices(kind, user, tank);
		if ('error' in preview) {
			logger.warn('import', `Couldn't read ${name}: ${preview.error}`, { userId: user.id, kind });
			// a column it couldn't find can be picked by hand
			const fileColumns: FileColumn[] | undefined = preview.fileColumns;
			return fail(400, { error: preview.error, mapping: fileColumns ? { file: name, csv: text, fileColumns, columns } : null });
		}
		// History (up to 2,000 rows) sends back the file and the ticked line numbers, not each row; lists send their rows
		return { preview: { file: name, ...preview, csv: text, columns } };
	},

	import: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'owner');
		const kind = kindOf(params.list);
		const form = await request.formData();
		const fileName = str(form, 'file') || null;
		const undo = { action: `/tanks/${tank.id}/import/${params.list}?/undo`, name: 'importId' };

		if (isHistoryKind(kind)) {
			const csv = form.get('csv');
			const lines = new Set(form.getAll('line').map(String));
			if (!lines.size) return fail(400, { error: 'Nothing was ticked. Choose the file again and tick the rows to add.' });
			if (typeof csv !== 'string' || csv.length > MAX_BYTES) return fail(400, { error: 'Some rows changed on the way. Choose the file again.' });
			// the same file, read again: a row is only added if it's still fine
			const read = readHistory(kind, lf(csv), historyContext(user, tank), columnMapOf(form));
			const picked = 'error' in read ? [] : read.rows.filter((r) => lines.has(String(r.line)));
			if (picked.length !== lines.size || picked.some((r) => !r.value || r.example || r.other)) {
				logger.warn('import', `Rows of ${fileName ?? 'a file'} changed between the preview and the import`, { userId: user.id, kind });
				return fail(400, { error: 'Some rows changed on the way. Choose the file again.' });
			}
			const { importId, summary } = applyHistory(kind, picked.map((r) => r.value!), user, tank, fileName);
			logger.info('import', `Imported ${summary}${fileName ? ` from ${fileName}` : ''}`, { userId: user.id, kind });
			setFlash(cookies, `✓ Imported ${summary}`, { undo: { ...undo, value: importId } });
			const cat = IMPORTS[kind].cat;
			redirect(303, `/history?tank=${tank.id}${cat ? `&cat=${cat}` : ''}&range=all`);
		}

		const today = todayInZone(user.timeZone);
		// the rows come back from the preview as it showed them; check them again
		const values = form.getAll('row').map((raw) => {
			try {
				return validValue(kind, JSON.parse(String(raw)), today);
			} catch {
				return null;
			}
		});
		if (!values.length) return fail(400, { error: 'Nothing was ticked. Choose the file again and tick the rows to add.' });
		if (values.some((v) => !v)) return fail(400, { error: 'Some rows changed on the way. Choose the file again.' });
		const ok = values as ImportValue[];
		const { reminders, importId, summary } = applyImport(kind, ok, user, tank.id, { reminders: form.get('reminders') === 'on', fileName });
		logger.info('import', `Imported ${summary}${fileName ? ` from ${fileName}` : ''}`, { userId: user.id, kind });
		const n = ok.length;
		const animals = kind === 'livestock' ? (ok as LivestockValue[]).reduce((s, l) => s + l.count, 0) : 0;
		const message =
			kind === 'livestock'
				? `✓ Imported ${animals} animal${animals === 1 ? '' : 's'} · ${n} species`
				: kind === 'plants'
					? `✓ Imported ${n} plant${n === 1 ? '' : 's'}`
					: kind === 'expenses'
						? `✓ Imported ${n} expense${n === 1 ? '' : 's'}`
					: `✓ Imported ${n} item${n === 1 ? '' : 's'}${reminders ? ` · ${reminders} reminder${reminders === 1 ? '' : 's'} added` : ''}`;
		setFlash(cookies, message, { undo: { ...undo, value: importId } });
		// back to the tab it's on: Livestock, Plants, Equipment or Spending
		redirect(303, `/tanks/${tank.id}/${IMPORTS[kind].slug}`);
	},

	/** Take back a whole import: from the toast right after, or from Recent imports. */
	undo: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const imp = undoImport(locals.user!.id, str(form, 'importId'));
		if (!imp.already) logger.info('import', `Undid the import of ${imp.summary}`, { userId: locals.user!.id, kind: imp.kind });
		setFlash(cookies, undoneText(imp));
		redirect(303, safeReturn(form.get('from'), `/tanks/${params.id}/import/${params.list}`));
	}
};
