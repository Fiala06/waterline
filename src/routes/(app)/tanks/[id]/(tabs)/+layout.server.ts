import { coverPosition } from '$lib/media';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { tankAge, todayInZone } from '$lib/time';
import { getTank } from '$lib/server/tanks';
import type { LayoutServerLoad } from './$types';
import { tankTypeLabel } from '$lib/types';

export const load: LayoutServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const t = getTank(user.id, params.id);
	const vol = (l: number | null) => (l == null ? null : formatNumber(toDisplay(l, 'volume', user), 1));
	const volUnit = unitLabel('volume', user);
	const nominal = vol(t.nominalVolumeL);
	const actual = vol(t.actualVolumeL);
	const { since } = tankAge(t.startDate, todayInZone(user.timeZone));
	return {
		tankHead: {
			id: t.id,
			name: t.name,
			type: t.type,
			cover: t.coverPhotoId,
			coverPos: coverPosition(t.coverX, t.coverY),
			archived: !!t.archivedAt,
			// T1: "Planted · 40 gal (34 actual) · since Mar 2025"; model and size are in Specs
			sub: [
				tankTypeLabel(t.type),
				nominal ? `${nominal} ${volUnit}${actual && actual !== nominal ? ` (${actual} actual)` : ''}` : null,
				since ? `since ${since}` : null
			]
				.filter(Boolean)
				.join(' · ')
		}
	};
};
