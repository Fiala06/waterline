import { EQUIPMENT_TYPE_LABEL, equipmentName, specSummary } from '$lib/equipment';
import { dateInZone, fmtDate } from '$lib/time';
import { db } from '$lib/server/db';
import { tasks } from '$lib/server/db/schema';
import { listEquipment } from '$lib/server/specs';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const since = (d: string | null) =>
	d ? new Date(d.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : null;

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const openTasks = db
		.select()
		.from(tasks)
		.where(and(eq(tasks.tankId, params.id), isNotNull(tasks.nextDue)))
		.all();
	const view = (e: ReturnType<typeof listEquipment>[number]) => {
		const name = equipmentName(e);
		const task = openTasks.find((t) => t.equipmentId === e.id);
		return {
			id: e.id,
			type: EQUIPMENT_TYPE_LABEL[e.type],
			name,
			// T2: "Tidewell 200 W" gets "Set 77 °F", not a second "200 W"
			summary: specSummary(e.type, e.specs, user).filter((s) => !name.includes(s)),
			since: since(e.installedAt),
			serviced: e.lastServicedAt ? fmtDate(dateInZone(e.lastServicedAt, user.timeZone)) : null,
			task: task?.name ?? null,
			notes: e.notes
		};
	};
	const items = listEquipment(user.id, params.id).map(view);
	return {
		// the tab's toolbar: "4 items"
		toolbarText: items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : '',
		items,
		past: listEquipment(user.id, params.id, { removed: true }).map(view)
	};
};
