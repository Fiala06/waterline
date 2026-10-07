// The getting-started checklist on a new tank's dashboard (#82): what to do
// after creating it, each step ticked off from the tank's own data, hidden by
// the keeper when they've seen enough, or brought back from Tank setup.

export type ChecklistState = 'hidden' | 'shown' | null;

export interface ChecklistFacts {
	tankId: string;
	type: string;
	cycling: boolean;
	/** ISO, when the tank was made */
	createdAt: string;
	state: ChecklistState;
	tests: number;
	livestock: number;
	plants: number;
	photos: number;
	/** a lights schedule on the tank or its light, or the tank goes without a light */
	lights: boolean;
	waterChangeTaskId: string | null;
}

export interface ChecklistStep {
	key: string;
	title: string;
	detail: string;
	href: string;
	done: boolean;
}

/** A tank counts as new for this long… */
export const NEW_FOR_DAYS = 60;
/** …unless it already has this many water tests. */
export const SETTLED_TESTS = 10;

/** The steps, in order, with what's done; plants only for a planted tank. */
export function checklistSteps(f: ChecklistFacts): ChecklistStep[] {
	const base = `/tanks/${f.tankId}`;
	return [
		{
			key: 'created',
			title: 'Tank created',
			detail: 'Its type, size and targets are set. Change any of them in Tank setup.',
			href: `${base}/settings`,
			done: true
		},
		{
			key: 'test',
			title: 'Log the first water test',
			detail: f.cycling
				? 'Ammonia, nitrite and nitrate every few days while it cycles: that is how you see the cycle move. Set Test every to 3 days for them.'
				: 'Every field is optional; the dashboard shows each reading against its target.',
			href: `/entries/test/new?tank=${f.tankId}`,
			done: f.tests > 0
		},
		{
			key: 'livestock',
			title: 'Add livestock',
			detail: f.cycling ? 'Once ammonia and nitrite both read 0. Species care ranges are then checked against your water.' : 'Fish, shrimp and snails by species, with their counts.',
			href: `${base}/livestock/several`,
			done: f.livestock > 0
		},
		...(f.type === 'planted'
			? [{ key: 'plants', title: 'Add plants', detail: 'By species, each with its place in the tank.', href: `${base}/plants/several`, done: f.plants > 0 }]
			: []),
		{
			key: 'lights',
			title: 'Set the light schedule',
			detail: 'Lights on and off in Tank setup, or on the light itself under Equipment.',
			href: `${base}/settings#lights`,
			done: f.lights
		},
		{
			key: 'water',
			title: 'Water-change reminder',
			detail: f.waterChangeTaskId ? 'Set up with the tank: change how often under Tasks.' : 'A regular water change keeps nitrate down.',
			href: f.waterChangeTaskId ? `/tasks/${f.waterChangeTaskId}` : `/tasks/new?tank=${f.tankId}&type=water_change`,
			done: !!f.waterChangeTaskId
		},
		{
			key: 'photo',
			title: 'Add a photo',
			detail: 'The first of many: photos show how the tank grows in.',
			href: `/photos?tank=${f.tankId}`,
			done: f.photos > 0
		}
	];
}

/** Whether the dashboard shows it: never once hidden, always once brought back, else while the tank is new. */
export function showChecklist(f: Pick<ChecklistFacts, 'state' | 'createdAt' | 'tests'>, now = Date.now()): boolean {
	if (f.state === 'hidden') return false;
	if (f.state === 'shown') return true;
	const ageDays = (now - Date.parse(f.createdAt)) / 86_400_000;
	return ageDays <= NEW_FOR_DAYS && f.tests < SETTLED_TESTS;
}
