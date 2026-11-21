// Source water (#315), under Tank setup: the tank's tap, well, RO or mix, each
// with its latest test beside the tank's latest readings and targets, in the
// tank's own units. The owner's: never on shared or public pages.
import { redirect } from '@sveltejs/kit';
import { fmtRange, fmtValue, paramUnit, shortName, statusOf } from '$lib/params';
import { daysBetween, dateInZone, fmtDateLong, todayInZone } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { optStr, refuse, str } from '$lib/server/forms';
import { getTank } from '$lib/server/tanks';
import {
	SOURCE_KIND_LABEL,
	SOURCE_STALE_DAYS,
	addSource,
	deleteSource,
	deleteSourceTest,
	getSource,
	isSourceKind,
	listSources,
	sourceComparison,
	updateSource
} from '$lib/server/water-sources';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id, 'owner');
	const tz = user.timeZone;
	const today = todayInZone(tz);
	const day = (iso: string) => fmtDateLong(dateInZone(iso, tz));
	return {
		tank: { id: tank.id, name: tank.name },
		kinds: Object.entries(SOURCE_KIND_LABEL).map(([value, label]) => ({ value, label })),
		sources: listSources(user.id, tank.id).map(({ source, tests }) => {
			const latest = tests[0];
			const age = latest ? daysBetween(dateInZone(latest.takenAt, tz), today) : null;
			return {
				id: source.id,
				name: source.name,
				kind: source.kind,
				kindLabel: SOURCE_KIND_LABEL[source.kind],
				note: source.note,
				// icon and word, never color alone
				tested: !latest ? '– Not tested yet' : age! > SOURCE_STALE_DAYS ? `▲ Last tested ${day(latest.takenAt)}, over ${Math.floor(age! / 30)} months ago` : `✓ Tested ${day(latest.takenAt)}`,
				rows: sourceComparison(tank.id, tests).map((r) => {
					const outside = statusOf(r.param, r.source.value).level === 'bad';
					return {
						id: r.param.id,
						name: shortName(r.param),
						unit: paramUnit(r.param, user),
						source: fmtValue(r.param, r.source.value, user),
						// older than the source's latest test: when it's from
						sourceDay: latest && r.source.takenAt !== latest.takenAt ? day(r.source.takenAt) : null,
						tank: r.tank ? fmtValue(r.param, r.tank.value, user) : '– No data',
						target: r.param.min == null && r.param.max == null ? '—' : fmtRange(r.param, user),
						outside
					};
				}),
				tests: tests.slice(0, 10).map((t) => ({ id: t.id, day: day(t.takenAt), count: t.readings.length, note: t.note }))
			};
		})
	};
};

function parseSource(form: FormData) {
	const name = str(form, 'name').slice(0, 60);
	const kind = str(form, 'kind');
	const note = optStr(form, 'note', 500);
	const values = { name, kind, note: note ?? '' };
	if (!name) return { error: 'Give the source a name, like Kitchen tap.', values };
	if (!isSourceKind(kind)) return { error: 'Choose what kind of water it is.', values };
	return { input: { name, kind, note }, values };
}

const back = (tankId: string) => `/tanks/${tankId}/source-water`;

export const actions: Actions = {
	add: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const p = parseSource(await request.formData());
		if (!p.input) return refuse('add', p.error!, p.values);
		const s = addSource(user.id, params.id, p.input);
		setFlash(cookies, `✓ ${s.name} added`);
		redirect(303, `${back(params.id)}/${s.id}/test`);
	},
	edit: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const id = str(form, 'id');
		const p = parseSource(form);
		if (!p.input) return refuse(`edit-${id}`, p.error!, p.values);
		updateSource(user.id, params.id, id, p.input);
		setFlash(cookies, '✓ Source saved');
		redirect(303, back(params.id));
	},
	delete: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const id = str(await request.formData(), 'id');
		const s = getSource(user.id, params.id, id);
		deleteSource(user.id, params.id, id);
		setFlash(cookies, `${s.name} deleted`);
		redirect(303, back(params.id));
	},
	deleteTest: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		deleteSourceTest(user.id, params.id, str(await request.formData(), 'id'));
		setFlash(cookies, 'Source test deleted');
		redirect(303, back(params.id));
	}
};
