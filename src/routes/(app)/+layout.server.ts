import { coverPosition } from '$lib/media';
import { dueInfo } from '$lib/tasks';
import { fmtWhen, todayInZone } from '$lib/time';
import { statusOf } from '$lib/params';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { fmtValue, shortName } from '$lib/params';
import { listEquipment, listLivestock, listPlants } from '$lib/server/specs';
import { listMembers } from '$lib/server/members';
import { db } from '$lib/server/db';
import { photos, wishes } from '$lib/server/db/schema';
import { and, count, eq, isNull } from 'drizzle-orm';
import { displayVersion, VERSION } from '$lib/changelog';
import { takeFlash } from '$lib/server/flash';
import { latestReadings, latestTest } from '$lib/server/logs';
import { listParams, listTanks, roleOn } from '$lib/server/tanks';
import { shownAvatar } from '$lib/server/avatar-image';
import { alertsSeen } from '$lib/server/users';
import { listTasks } from '$lib/server/tasks';
import { availableUpdate, projectPage } from '$lib/server/updates';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url, cookies, params, route }) => {
	const user = locals.user!;
	const tanks = listTanks(user.id);
	const today = todayInZone(user.timeZone);

	// A tank's own pages make it the current tank, as picking it in the switcher does.
	const routeTank = route.id?.startsWith('/(app)/tanks/[id]') ? params.id : undefined;
	const requested = url.searchParams.get('tank') ?? routeTank ?? null;
	let currentTankId = requested ?? cookies.get('wl_tank') ?? null;
	if (!tanks.some((t) => t.id === currentTankId)) currentTankId = tanks[0]?.id ?? null;
	if (requested && currentTankId === requested) {
		cookies.set('wl_tank', requested, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 31536000 });
	}

	const tasks = listTasks(user.id);
	const overdueByTank = new Map<string, number>();
	let overdueCount = 0;
	// the alerts panel: overdue tasks and out-of-range readings, each with where to go
	const alerts: { key: string; kind: 'task' | 'reading'; title: string; sub: string; href: string; tankId: string }[] = [];
	const nameOf = (id: string) => tanks.find((t) => t.id === id)?.name ?? '';
	for (const { task } of tasks) {
		const d = dueInfo(task.due, today);
		if (d.section === 'overdue') {
			overdueCount++;
			overdueByTank.set(task.tankId, (overdueByTank.get(task.tankId) ?? 0) + 1);
			alerts.push({ key: `task:${task.id}:${task.due}`, kind: 'task', title: task.name, sub: `${nameOf(task.tankId)} · ${d.text}`, href: `/tasks?filter=${task.tankId}`, tankId: task.tankId });
		}
	}

	const summaries = tanks.map((t) => {
		const latest = latestReadings(t.id);
		let outOfRange = 0;
		for (const p of listParams(t.id)) {
			const r = latest.get(p.id);
			const st = statusOf(p, r?.value);
			if (st.level !== 'bad' || !r) continue;
			outOfRange++;
			alerts.push({
				key: `reading:${p.id}:${r.takenAt}`,
				kind: 'reading',
				title: `${shortName(p)} ${st.direction === 'low' ? 'low' : 'high'} · ${fmtValue(p, r.value, user)}`,
				sub: `${t.name} · ${fmtWhen(r.takenAt, user.timeZone)}`,
				href: `/charts?tank=${t.id}&p=${p.id}`,
				tankId: t.id
			});
		}
		return {
			id: t.id,
			name: t.name,
			type: t.type,
			volume:
				t.nominalVolumeL != null
					? `${formatNumber(toDisplay(t.nominalVolumeL, 'volume', user), 1)} ${unitLabel('volume', user)}`
					: null,
			startDate: t.startDate,
			// shared with this person (#22): what they may do, and whose it is
			role: roleOn(user.id, t),
			cover: t.coverPhotoId,
			coverPos: coverPosition(t.coverX, t.coverY),
			alerts: outOfRange + (overdueByTank.get(t.id) ?? 0),
			// shown apart in the sidebar: "✕ 1" readings out of range, "▲ 1" tasks overdue
			outOfRange,
			overdue: overdueByTank.get(t.id) ?? 0,
			// never tested: "No data", not "All good"
			tested: latest.size > 0
		};
	});

	// Context for the quick-add sheet.
	const lastTest = currentTankId ? latestTest(currentTankId) : undefined;
	// the tank tabs' counts (Photos 34, Livestock 23, …)
	const counts = currentTankId
		? {
				photos: db.select({ n: count() }).from(photos).where(eq(photos.tankId, currentTankId)).get()?.n ?? 0,
				livestock: listLivestock(user.id, currentTankId).reduce((n, l) => n + (l.status === 'in_tank' || l.status === 'quarantine' ? l.count : 0), 0),
				plants: listPlants(user.id, currentTankId).length,
				equipment: listEquipment(user.id, currentTankId).length,
				// people the tank is shared with (#22), for Setup › Sharing
				members: listMembers(currentTankId).filter((m) => m.state === 'accepted' || m.state === 'pending').length,
				// still planned on the wish list (#24), for More on a phone
				wishes: db.select({ n: count() }).from(wishes).where(and(eq(wishes.tankId, currentTankId), isNull(wishes.addedAt))).get()?.n ?? 0
			}
		: { photos: 0, livestock: 0, plants: 0, equipment: 0, members: 0, wishes: 0 };
	const wcTask = tasks.find((r) => r.task.tankId === currentTankId && r.task.kind === 'water_change')?.task;

	const flash = takeFlash(cookies);
	const avatar = shownAvatar(user);
	return {
		user: {
			id: user.id,
			email: user.email,
			displayName: user.displayName,
			isAdmin: user.isAdmin,
			unitSystem: user.unitSystem,
			hardnessUnit: user.hardnessUnit,
			timeZone: user.timeZone,
			theme: user.theme,
			currency: user.currency,
			// the account menu's photo; a new address each time it changes
			avatar: avatar ? `/avatar?v=${Date.parse(avatar.at)}` : null,
			// for Settings › Profile: which photo it is, and whether there's a Google one to go back to
			avatarKind: avatar?.kind ?? null,
			hasGooglePhoto: !!user.avatarAt
		},
		tanks: summaries,
		currentTankId,
		overdueCount,
		alerts,
		// the alert keys already marked read, kept on the account (every device agrees)
		alertsSeen: alertsSeen(user),
		counts,
		quick: {
			lastTest: lastTest ? `Last test ${fmtWhen(lastTest.takenAt, user.timeZone).replace(/^Today/, 'today').replace(/^Yesterday/, 'yesterday')}` : 'No tests yet',
			lastTestAt: lastTest?.takenAt ?? null,
			wcDue: wcTask ? dueInfo(wcTask.due, today) : null
		},
		flash: flash ? { ...flash, id: crypto.randomUUID() } : null,
		// the version running; a newer release only for admins, who can update the server
		app: { version: displayVersion(VERSION), update: user.isAdmin ? availableUpdate() : null, repo: projectPage() }
	};
};
