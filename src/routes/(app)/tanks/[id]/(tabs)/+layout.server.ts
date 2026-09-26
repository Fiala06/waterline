import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { getTank } from '$lib/server/tanks';
import type { LayoutServerLoad } from './$types';
import { tankTypeLabel } from '$lib/types';

export const load: LayoutServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const t = getTank(user.id, params.id);
	const vol = (l: number | null) => (l == null ? null : formatNumber(toDisplay(l, 'volume', user), 0));
	const len = (c: number | null) => (c == null ? null : formatNumber(toDisplay(c, 'length', user), 0));
	const dims = t.lengthCm && t.widthCm && t.heightCm ? `${len(t.lengthCm)} × ${len(t.widthCm)} × ${len(t.heightCm)} ${unitLabel('length', user)}` : null;
	const volUnit = unitLabel('volume', user);
	const nominal = vol(t.nominalVolumeL);
	const actual = vol(t.actualVolumeL);
	const since = t.startDate
		? new Date(t.startDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
		: null;
	return {
		tankHead: {
			id: t.id,
			name: t.name,
			type: t.type,
			cover: t.coverPhotoId,
			archived: !!t.archivedAt,
			sub: [
				tankTypeLabel(t.type),
				nominal ? `${nominal} ${volUnit}${actual && actual !== nominal ? ` (${actual} actual)` : ''}` : null,
				since ? `since ${since}` : null
			]
				.filter(Boolean)
				.join(' · '),
			model: [t.specBrand, t.specModel].filter(Boolean).join(' ') || null,
			dims
		}
	};
};
