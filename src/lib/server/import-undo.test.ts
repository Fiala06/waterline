import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'wl-import-undo-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { acceptMemberInvites, inviteMember, removeMember, setMemberRole } = await import('./members');
const { applyImport, undoImport } = await import('./import');
const { listLivestock } = await import('./specs');

const owner = upsertUser({ email: 'undo-owner@example.com', name: 'Owner' });
const helper = upsertUser({ email: 'undo-helper@example.com', name: 'Helper' });
const tank = createTank(owner, { name: 'Shared tank', type: 'planted', nominalVolumeL: 60 });
const fish = (count: number) => ({ kind: 'fish' as const, name: 'Neon tetra', scientific: null, count, added: null, status: 'in_tank' as const, source: null });

describe('undoing an import (#289)', () => {
	it('is only for someone who can still change the tank', () => {
		const { member } = inviteMember(tank, helper.email, 'log', owner.id);
		acceptMemberInvites(helper.email, helper.id, { id: member.id });
		const first = applyImport('livestock', [fish(6)], helper, tank.id, { reminders: false, fileName: null });
		const second = applyImport('livestock', [fish(4)], helper, tank.id, { reminders: false, fileName: null });

		// only viewing now: their imports stay
		setMemberRole(tank.id, member.id, 'view');
		expect(() => undoImport(helper.id, first.importId)).toThrow();
		// removed: the same
		removeMember(tank.id, member.id);
		expect(() => undoImport(helper.id, second.importId)).toThrow();
		expect(listLivestock(owner.id, tank.id).reduce((n, l) => n + l.count, 0)).toBe(10);
	});

	it('works for the one who imported while they can still log', () => {
		const other = createTank(owner, { name: 'Second tank', type: 'planted', nominalVolumeL: 60 });
		const { member } = inviteMember(other, helper.email, 'log', owner.id);
		acceptMemberInvites(helper.email, helper.id, { id: member.id });
		const imp = applyImport('livestock', [fish(3)], helper, other.id, { reminders: false, fileName: null });
		expect(undoImport(helper.id, imp.importId).already).toBe(false);
		expect(listLivestock(owner.id, other.id)).toHaveLength(0);
	});
});
