import { EQUIPMENT_TYPE_LABEL, equipmentName, specSummary } from '$lib/equipment';
import { fmtDate } from '$lib/time';
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
		const task = openTasks.find((t) => t.equipmentId === e.id || t.name.includes(name));
		return {
			id: e.id,
			type: EQUIPMENT_TYPE_LABEL[e.type],
			name,
			summary: specSummary(e.type, e.specs, user),
			since: since(e.installedAt),
			serviced: e.lastServicedAt ? fmtDate(e.lastServicedAt.slice(0, 10)) : null,
			task: task?.name ?? null,
			notes: e.notes
		};
	};
	return {
		items: listEquipment(user.id, params.id).map(view),
		past: listEquipment(user.id, params.id, { removed: true }).map(view)
	};
};
