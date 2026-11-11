import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

// Mark done / Snooze links from a reminder (#216): each acts as the person
// the reminder was sent to, for as long as they may still log on the tank.
const dir = mkdtempSync(join(tmpdir(), 'wl-action-tokens-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir, OPEN_SIGNUP: 'true' } }));
const { db } = await import('./db');
const { actionTokens, events, serverSettings } = await import('./db/schema');
const { getServerSettings } = await import('./mail');
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { acceptMemberInvites, getMember, inviteMember, listMembers, removeMember, setMemberRole } = await import('./members');
const { completeTask, listTasks } = await import('./tasks');
const { consumeActionToken, createActionToken, readActionToken, revokeActionTokens } = await import('./action-tokens');

const owner = upsertUser({ email: 'owner@example.com', name: 'Owner', googleSub: 'g-owner' });
const helper = upsertUser({ email: 'helper@example.com', name: 'Helper', googleSub: 'g-helper' });
const tank = createTank(owner, { name: 'Shared 40', type: 'freshwater', nominalVolumeL: 150 });
acceptMemberInvites(helper.email, helper.id, { id: inviteMember(tank, helper.email, 'log', owner.id).member.id });
const membership = () => listMembers(tank.id).find((m) => m.member.userId === helper.id)!.member;
const task = () => listTasks(owner.id, tank.id)[0].task;
const link = (userId: string, action: 'done' | 'snooze' = 'done') => createActionToken(task().id, action, task().nextDue!, userId);

describe('a reminder’s Mark done and Snooze links (#216)', () => {
	it('act as the person the reminder went to, and History says so', () => {
		const forHelper = readActionToken(link(helper.id));
		expect(forHelper.state).toBe('ok');
		expect(forHelper.row!.user.id).toBe(helper.id);
		expect(readActionToken(link(owner.id)).row!.user.id).toBe(owner.id);

		const token = link(helper.id);
		const { row } = readActionToken(token);
		expect(consumeActionToken(token)).toBe(true);
		completeTask(row!.user.id, row!.task.id, { timeZone: 'UTC' });
		const logged = db.select().from(events).where(eq(events.tankId, tank.id)).all().filter((e) => e.loggedBy === helper.id);
		expect(logged).toHaveLength(1);
		expect(readActionToken(token).state).toBe('used');
	});

	it('stop working for someone made view-only, and work again if they may log again', () => {
		const token = link(helper.id);
		setMemberRole(tank.id, membership().id, 'view');
		expect(readActionToken(token).state).toBe('expired');
		// the owner's own link for the same task is untouched
		expect(readActionToken(link(owner.id)).state).toBe('ok');
		setMemberRole(tank.id, membership().id, 'log');
		expect(readActionToken(token).state).toBe('ok');
	});

	it('are removed with the person’s access, the owner’s kept', () => {
		const theirs = link(helper.id);
		const snooze = link(helper.id, 'snooze');
		const mine = link(owner.id);
		const id = membership().id;
		removeMember(tank.id, id);
		expect(getMember(tank.id, id).revokedAt).not.toBeNull();
		// refused at once, by their role
		expect(readActionToken(theirs).state).toBe('expired');
		// and gone once the sharing page has tidied up after the removal
		revokeActionTokens(helper.id, tank.id);
		expect(readActionToken(theirs).state).toBe('missing');
		expect(readActionToken(snooze).state).toBe('missing');
		expect(readActionToken(mine).state).toBe('ok');
	});

	it('stop for someone who may no longer sign in', () => {
		const token = link(owner.id);
		getServerSettings();
		const second = upsertUser({ email: 'second@example.com', name: 'Second', googleSub: 'g-second' });
		const theirs = createTank(second, { name: 'Their tank', type: 'freshwater', nominalVolumeL: 60 });
		const t = listTasks(second.id, theirs.id)[0].task;
		const locked = createActionToken(t.id, 'done', t.nextDue!, second.id);
		expect(readActionToken(locked).state).toBe('ok');
		try {
			db.update(serverSettings).set({ signupMode: 'admin' }).where(eq(serverSettings.id, 1)).run();
			expect(second.isAdmin).toBe(false);
			expect(readActionToken(locked).state).toBe('expired');
		} finally {
			db.update(serverSettings).set({ signupMode: null }).where(eq(serverSettings.id, 1)).run();
		}
		expect(readActionToken(token).state).toBe('ok');
	});

	it('from before they recorded who they were for act as the tank’s owner, as they did', () => {
		const token = link(owner.id);
		db.update(actionTokens).set({ userId: null }).run();
		expect(readActionToken(token).row!.user.id).toBe(owner.id);
		expect(readActionToken(token).state).toBe('ok');
	});
});
