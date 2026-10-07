import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

// Who may reach what (#106): every guard in the server modules, tried by
// someone who shouldn't pass it. A database of its own, with every migration.
const dir = mkdtempSync(join(tmpdir(), 'wl-security-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { exports, oauthCodes, photos } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank, getTank, listParams, listTanks, setArchived, updateParams, updateTank } = await import('./tanks');
const { inviteMember, requireRole, requireRoleOn, tankRole } = await import('./members');
const { createEvent, createTest, deleteEvent, deleteTest, getEvent, getTest, updateEvent, updateTest } = await import('./logs');
const { completeTask, createTask, deleteTask, getTask, listTasks, skipTask, snoozeTask, updateTask } = await import('./tasks');
const { addExpense, deleteExpense, getExpense, listExpenses, updateExpense } = await import('./expenses');
const { addProduct, deleteProduct, getProduct, updateProduct } = await import('./products');
const { addKit, deleteKit, getKit, updateKit } = await import('./kits');
const specs = await import('./specs');
const { addWish, addWishToTank, deleteWish, getWish, listWishes } = await import('./wishes');
const { deletePhoto, getPhoto, setCover, setInTimeline } = await import('./photos');
const { getExport } = await import('./export');
const { createShare, getPublicPage, getShareForPhoto, revokeShare, updatePublicPage, updateShare } = await import('./public');
const { authenticateAssistant, authenticateSensor, createAssistantToken, revokeAssistantToken, setTokenTanks } = await import('./assistant/tokens');
const { runTool, photoFor, ToolError } = await import('./assistant/tools');
const { approve, exchangeCode, readAuthorize, registerClient, getClient } = await import('./assistant/oauth');

/** The HTTP status a guard stopped with, or null when it let the call through. */
function statusOf(fn: () => unknown): number | null {
	try {
		// an async function's refusal comes as a rejection: those use expectStatusAsync, so none goes unchecked
		if (fn() instanceof Promise) throw new Error('async: use expectStatusAsync / statusOfAsync');
	} catch (e) {
		const s = (e as { status?: unknown }).status;
		if (typeof s === 'number') return s;
		throw e;
	}
	return null;
}
const expectStatus = (fn: () => unknown, status: number) => expect(statusOf(fn)).toBe(status);
async function statusOfAsync(fn: () => Promise<unknown>): Promise<number | null> {
	try {
		await fn();
	} catch (e) {
		const s = (e as { status?: unknown }).status;
		if (typeof s === 'number') return s;
		throw e;
	}
	return null;
}
const expectStatusAsync = async (fn: () => Promise<unknown>, status: number) => expect(await statusOfAsync(fn)).toBe(status);

const tz = { timeZone: 'UTC' };
const at = '2026-10-01T09:00:00.000Z';

// ── The people ──────────────────────────────────────────────────────────────

const A = upsertUser({ email: 'owner-a@example.com', name: 'Owner A', googleSub: 'g-a' });
const B = upsertUser({ email: 'owner-b@example.com', name: 'Owner B', googleSub: 'g-b' });
const V = upsertUser({ email: 'viewer@example.com', name: 'Viewer', googleSub: 'g-v' });
const L = upsertUser({ email: 'logger@example.com', name: 'Logger', googleSub: 'g-l' });
const S = upsertUser({ email: 'stranger@example.com', name: 'Stranger', googleSub: 'g-s' });

const T = createTank(A, { name: 'Riverbed 40', type: 'planted', nominalVolumeL: 150 });
const U = createTank(B, { name: 'Reef 24', type: 'reef', nominalVolumeL: 90 });
// the logger and the viewer have tanks of their own, to move things into
const LX = createTank(L, { name: 'Logger’s own', type: 'freshwater', nominalVolumeL: 60 });
const VX = createTank(V, { name: 'Viewer’s own', type: 'freshwater', nominalVolumeL: 60 });
inviteMember(T, V.email, 'view', A.id);
inviteMember(T, L.email, 'log', A.id);

// ── A's records on T, one of each kind ──────────────────────────────────────

const param = listParams(T.id)[0];
const { test } = createTest(A.id, T.id, { takenAt: at, note: 'A’s test', readings: new Map([[param.id, 7]]) }, tz);
const { event } = createEvent(A.id, T.id, { category: 'note', occurredAt: at, note: 'A’s note', data: {} }, tz);
const task = listTasks(A.id, T.id)[0].task;
const expense = addExpense(A.id, T.id, { date: '2026-10-01', amountCents: 2500, category: 'equipment', what: 'Heater', note: null });
const product = addProduct(A.id, { name: 'Easy Green', url: 'https://example.com/easy-green', note: null, strengthMgPerMl: null, strengthOf: null });
const kit = addKit(A.id, { name: 'API nitrate', paramKey: 'no3', steps: [{ text: 'Add 10 drops' }] });
const gear = specs.addEquipment(A.id, T.id, { type: 'heater', brand: 'Eheim', model: 'Jäger', specs: {}, installedAt: null, notes: null }, 'UTC');
const { row: fish } = specs.addLivestock(A.id, T.id, { kind: 'fish', commonName: 'Corydoras', scientificName: null, count: 6, status: 'in_tank', addedAt: null, source: null });
const plant = specs.addPlant(A.id, T.id, { name: 'Java fern', scientificName: null, position: 'midground', status: 'thriving' });
const wishInput = { kind: 'plant' as const, name: 'Anubias', scientificName: null, count: 1, equipmentType: null, note: null, priceCents: null, url: null };
const wish = addWish(A.id, T.id, wishInput);
// a photo row without files: the guards only read the row
const photoOn = (tankId: string) =>
	db.insert(photos).values({ tankId, path: `${tankId}/x.jpg`, thumbPath: `${tankId}/x_t.jpg`, width: 10, height: 10, takenAt: at }).returning().get();
const photo = photoOn(T.id);
const photoU = photoOn(U.id);
createShare(A.id, photo.id);
const exportRow = db.insert(exports).values({ userId: A.id, scope: 'tank', tankId: T.id, format: 'csv' }).returning().get();

// ── 1. IDOR: someone with no access, by id ─────────────────────────────────

describe('a stranger can’t reach another keeper’s records by id (404, so nothing leaks)', () => {
	for (const [who, p] of [
		['a stranger', S],
		['another owner', B]
	] as const) {
		describe(who, () => {
			it('can’t see or change the tank', async () => {
				expect(tankRole(p.id, T)).toBeNull();
				expect(listTanks(p.id).map((t) => t.id)).not.toContain(T.id);
				expectStatus(() => getTank(p.id, T.id), 404);
				expectStatus(() => getTank(p.id, T.id, 'owner'), 404);
				expectStatus(() => updateTank(p.id, T.id, { name: 'Mine now' }), 404);
				expectStatus(() => updateParams(p.id, T.id, [{ id: param.id, min: 0, max: 1, tracked: true }]), 404);
				expectStatus(() => setArchived(p.id, T.id, true), 404);
				expectStatus(() => requireRoleOn(p.id, T.id, 'log'), 404);
			});

			it('can’t read, edit or delete a water test, or log one', async () => {
				expectStatus(() => getTest(p.id, test.id), 404);
				expectStatus(() => updateTest(p.id, test.id, { takenAt: at, note: 'x', readings: new Map() }), 404);
				expectStatus(() => deleteTest(p.id, test.id), 404);
				expectStatus(() => createTest(p.id, T.id, { takenAt: at, note: null, readings: new Map() }, tz), 404);
			});

			it('can’t read, edit or delete an event, or log one', async () => {
				expectStatus(() => getEvent(p.id, event.id), 404);
				expectStatus(() => updateEvent(p.id, event.id, { occurredAt: at, note: 'x', data: {} }), 404);
				expectStatus(() => deleteEvent(p.id, event.id), 404);
				expectStatus(() => createEvent(p.id, T.id, { category: 'note', occurredAt: at, note: null, data: {} }, tz), 404);
			});

			it('can’t read or act on a task', async () => {
				expectStatus(() => getTask(p.id, task.id), 404);
				expect(listTasks(p.id).map((r) => r.task.id)).not.toContain(task.id);
				expectStatus(() => completeTask(p.id, task.id, tz), 404);
				expectStatus(() => skipTask(p.id, task.id, tz), 404);
				expectStatus(() => snoozeTask(p.id, task.id, '2026-12-01'), 404);
				expectStatus(() => updateTask(p.id, task.id, { ...task, tankId: T.id }), 404);
				expectStatus(() => deleteTask(p.id, task.id), 404);
				expectStatus(() => createTask(p.id, T.id, { ...task }), 404);
				// nor move it into a tank of their own
				if (p === B) expectStatus(() => updateTask(B.id, task.id, { ...task, tankId: U.id }), 404);
			});

			it('can’t read, edit or delete an expense', async () => {
				expectStatus(() => getExpense(p.id, expense.id), 404);
				expectStatus(() => listExpenses(p.id, T.id), 404);
				await expectStatusAsync(() => updateExpense(p.id, expense.id, { date: '2026-10-01', amountCents: 1, category: 'other', what: 'x', note: null, tankId: T.id }), 404);
				await expectStatusAsync(() => deleteExpense(p.id, expense.id), 404);
				expectStatus(() => addExpense(p.id, T.id, { date: '2026-10-01', amountCents: 1, category: 'other', what: 'x', note: null }), 404);
			});

			it('can’t read, edit or delete a product or a test kit (they’re per account)', async () => {
				const input = { name: 'x', url: 'https://example.com', note: null, strengthMgPerMl: null, strengthOf: null };
				expectStatus(() => getProduct(p.id, product.id), 404);
				expectStatus(() => updateProduct(p.id, product.id, input), 404);
				expectStatus(() => deleteProduct(p.id, product.id), 404);
				expectStatus(() => getKit(p.id, kit.id), 404);
				expectStatus(() => updateKit(p.id, kit.id, { name: 'x', paramKey: 'no3', steps: [] }), 404);
				expectStatus(() => deleteKit(p.id, kit.id), 404);
			});

			it('can’t read or change equipment, livestock or plants', async () => {
				expectStatus(() => specs.getEquipment(p.id, gear.id), 404);
				expectStatus(() => specs.listEquipment(p.id, T.id), 404);
				expectStatus(() => specs.updateEquipment(p.id, gear.id, { type: 'heater', brand: 'x', model: null, specs: {}, installedAt: null, notes: null }), 404);
				expectStatus(() => specs.removeEquipment(p.id, gear.id), 404);
				expectStatus(() => specs.markServiced(p.id, gear.id, at), 404);
				expectStatus(() => specs.getLivestock(p.id, fish.id), 404);
				expectStatus(() => specs.changeCount(p.id, fish.id, 0, 'loss'), 404);
				expectStatus(() => specs.setLivestockStatus(p.id, fish.id, 'quarantine'), 404);
				expectStatus(() => specs.nameLivestock(p.id, fish.id, 'Pepper'), 404);
				expectStatus(() => specs.updateLivestockDetails(p.id, fish.id, { notes: 'x' }), 404);
				expectStatus(() => specs.getPlant(p.id, plant.id), 404);
				expectStatus(() => specs.updatePlant(p.id, plant.id, { status: 'melting' }), 404);
				expectStatus(() => specs.removePlant(p.id, plant.id), 404);
				expectStatus(() => specs.logTrim(p.id, T.id, [plant.id], null), 404);
			});

			it('can’t read or change the wish list', async () => {
				expectStatus(() => listWishes(p.id, T.id), 404);
				expectStatus(() => getWish(p.id, T.id, wish.id), 404);
				expectStatus(() => addWish(p.id, T.id, wishInput), 404);
				expectStatus(() => deleteWish(p.id, T.id, wish.id), 404);
				expectStatus(() => addWishToTank(p, T.id, wish.id, { spend: false }), 404);
				// a wish of T's, asked for through a tank of their own
				if (p === B) expectStatus(() => getWish(B.id, U.id, wish.id), 404);
			});

			it('can’t see or change a photo, or its share link', async () => {
				expectStatus(() => getPhoto(p.id, photo.id), 404);
				await expectStatusAsync(() => deletePhoto(p.id, photo.id), 404);
				expectStatus(() => setInTimeline(p.id, photo.id, false), 404);
				expectStatus(() => setCover(p.id, photo.id), 404);
				expectStatus(() => getShareForPhoto(p.id, photo.id), 404);
				expectStatus(() => createShare(p.id, photo.id), 404);
				expectStatus(() => updateShare(p.id, photo.id, { includeNote: true, includeTank: true }), 404);
				expectStatus(() => revokeShare(p.id, photo.id), 404);
			});

			it('can’t open the public page settings or someone’s export', async () => {
				expectStatus(() => getPublicPage(p.id, T.id), 404);
				expectStatus(() => updatePublicPage(p.id, T.id, { enabled: true }), 404);
				expectStatus(() => getExport(p.id, exportRow.id), 404);
			});
		});
	}
});

// ── 2. Roles on a shared tank ───────────────────────────────────────────────

describe('each person’s role on the shared tank', () => {
	it('is owner, log, view, or none', async () => {
		expect(tankRole(A.id, T)).toBe('owner');
		expect(tankRole(L.id, T)).toBe('log');
		expect(tankRole(V.id, T)).toBe('view');
		expect(tankRole(S.id, T)).toBeNull();
		expect(tankRole(B.id, T)).toBeNull();
		expect(tankRole(A.id, U)).toBeNull();
	});
});

describe('"view" can read, never write (403)', () => {
	it('reads the tank and its records', async () => {
		expect(getTank(V.id, T.id).id).toBe(T.id);
		expect(getTest(V.id, test.id).test.id).toBe(test.id);
		expect(getEvent(V.id, event.id).id).toBe(event.id);
		expect(getTask(V.id, task.id).id).toBe(task.id);
		expect(getExpense(V.id, expense.id).id).toBe(expense.id);
		expect(specs.getEquipment(V.id, gear.id).id).toBe(gear.id);
		expect(specs.getLivestock(V.id, fish.id).id).toBe(fish.id);
		expect(specs.getPlant(V.id, plant.id).id).toBe(plant.id);
		expect(getWish(V.id, T.id, wish.id).id).toBe(wish.id);
		expect(getPhoto(V.id, photo.id).id).toBe(photo.id);
	});

	it('logs nothing', async () => {
		expectStatus(() => getTank(V.id, T.id, 'log'), 403);
		expectStatus(() => createTest(V.id, T.id, { takenAt: at, note: null, readings: new Map() }, tz), 403);
		expectStatus(() => updateTest(V.id, test.id, { takenAt: at, note: 'x', readings: new Map() }), 403);
		expectStatus(() => deleteTest(V.id, test.id), 403);
		expectStatus(() => createEvent(V.id, T.id, { category: 'note', occurredAt: at, note: null, data: {} }, tz), 403);
		expectStatus(() => updateEvent(V.id, event.id, { occurredAt: at, note: 'x', data: {} }), 403);
		expectStatus(() => deleteEvent(V.id, event.id), 403);
	});

	it('does no tasks', async () => {
		expectStatus(() => completeTask(V.id, task.id, tz), 403);
		expectStatus(() => skipTask(V.id, task.id, tz), 403);
		expectStatus(() => snoozeTask(V.id, task.id, '2026-12-01'), 403);
		expectStatus(() => updateTask(V.id, task.id, { ...task, tankId: T.id }), 403);
		expectStatus(() => deleteTask(V.id, task.id), 403);
	});

	it('changes no equipment, livestock, plants or photos', async () => {
		expectStatus(() => specs.addEquipment(V.id, T.id, { type: 'light', brand: null, model: null, specs: {}, installedAt: null, notes: null }, 'UTC'), 403);
		expectStatus(() => specs.markServiced(V.id, gear.id, at), 403);
		expectStatus(() => specs.addLivestock(V.id, T.id, { kind: 'fish', commonName: 'Guppy', scientificName: null, count: 1, status: 'in_tank', addedAt: null, source: null }), 403);
		expectStatus(() => specs.changeCount(V.id, fish.id, 5, 'loss'), 403);
		expectStatus(() => specs.nameLivestock(V.id, fish.id, 'Pepper'), 403);
		expectStatus(() => specs.addPlant(V.id, T.id, { name: 'Moss', scientificName: null, position: 'foreground', status: 'thriving' }), 403);
		expectStatus(() => specs.updatePlant(V.id, plant.id, { status: 'melting' }), 403);
		expectStatus(() => specs.removePlant(V.id, plant.id), 403);
		expectStatus(() => specs.addPar(V.id, T.id, { spot: 'c', x: 0, y: 0, value: 100, note: null, measuredAt: at }), 403);
		await expectStatusAsync(() => deletePhoto(V.id, photo.id), 403);
		expectStatus(() => setInTimeline(V.id, photo.id, false), 403);
	});

	// fixed with #106
	it('can’t log a trim', async () => {
		expectStatus(() => specs.logTrim(V.id, T.id, [plant.id], null), 403);
	});

	it('spends nothing and changes no setup, sharing or public page', async () => {
		expectStatus(() => addExpense(V.id, T.id, { date: '2026-10-01', amountCents: 1, category: 'other', what: 'x', note: null }), 403);
		await expectStatusAsync(() => deleteExpense(V.id, expense.id), 403);
		expectStatus(() => updateTank(V.id, T.id, { name: 'x' }), 403);
		expectStatus(() => updateParams(V.id, T.id, [{ id: param.id, min: 0, max: 1, tracked: true }]), 403);
		expectStatus(() => requireRole(V.id, T, 'owner'), 403);
		expectStatus(() => getPublicPage(V.id, T.id), 403);
		expectStatus(() => updateShare(V.id, photo.id, { includeNote: true, includeTank: true }), 403);
		expectStatus(() => addWish(V.id, T.id, wishInput), 403);
		expectStatus(() => addWishToTank(V, T.id, wish.id, { spend: false }), 403);
	});

	// fixed with #106
	it('can’t move the owner’s expense into a tank of their own', async () => {
		// an expense of its own, so a regression would really move it
		const e = addExpense(A.id, T.id, { date: '2026-10-01', amountCents: 900, category: 'plants', what: 'Moss', note: null });
		await expectStatusAsync(() => updateExpense(V.id, e.id, { date: '2026-10-01', amountCents: 1, category: 'other', what: 'mine', note: null, tankId: VX.id }), 403);
	});
});

describe('"log" logs, never changes setup or sharing (403)', () => {
	it('logs tests and events, edits and deletes its own, and does tasks', async () => {
		const { test: t } = createTest(L.id, T.id, { takenAt: at, note: null, readings: new Map([[param.id, 6.8]]) }, tz);
		expect(t.loggedBy).toBe(L.id);
		expect(statusOf(() => updateTest(L.id, t.id, { takenAt: at, note: 'fixed', readings: new Map() }))).toBeNull();
		expect(deleteTest(L.id, t.id).id).toBe(t.id);
		const { event: e } = createEvent(L.id, T.id, { category: 'note', occurredAt: at, note: 'water looks clear', data: {} }, tz);
		expect(statusOf(() => updateEvent(L.id, e.id, { occurredAt: at, note: 'still clear', data: {} }))).toBeNull();
		expect(deleteEvent(L.id, e.id).id).toBe(e.id);
		expect(statusOf(() => snoozeTask(L.id, task.id, '2026-12-01'))).toBeNull();
		expect(completeTask(L.id, task.id, tz).id).toBe(task.id);
		expect(statusOf(() => specs.changeCount(L.id, fish.id, 6, 'recount'))).toBeNull();
	});

	it('changes no setup, targets or schedule', async () => {
		expectStatus(() => getTank(L.id, T.id, 'owner'), 403);
		expectStatus(() => updateTank(L.id, T.id, { name: 'Mine now' }), 403);
		expectStatus(() => updateParams(L.id, T.id, [{ id: param.id, min: 0, max: 1, tracked: false }]), 403);
		expectStatus(() => setArchived(L.id, T.id, true), 403);
		expectStatus(() => createTask(L.id, T.id, { ...task }), 403);
		expectStatus(() => updateTask(L.id, task.id, { ...task, tankId: T.id }), 403);
		expectStatus(() => deleteTask(L.id, task.id), 403);
		expectStatus(() => specs.updateEquipment(L.id, gear.id, { type: 'heater', brand: 'x', model: null, specs: {}, installedAt: null, notes: null }), 403);
		expectStatus(() => specs.removeEquipment(L.id, gear.id), 403);
		expectStatus(() => setCover(L.id, photo.id), 403);
	});

	it('changes no sharing, public page, spending or wish list', async () => {
		expectStatus(() => requireRole(L.id, T, 'owner'), 403);
		expectStatus(() => requireRoleOn(L.id, T.id, 'owner'), 403);
		expectStatus(() => getPublicPage(L.id, T.id), 403);
		expectStatus(() => updatePublicPage(L.id, T.id, { enabled: true }), 403);
		expectStatus(() => createShare(L.id, photo.id), 403);
		expectStatus(() => updateShare(L.id, photo.id, { includeNote: true, includeTank: true }), 403);
		expectStatus(() => revokeShare(L.id, photo.id), 403);
		expectStatus(() => addExpense(L.id, T.id, { date: '2026-10-01', amountCents: 1, category: 'other', what: 'x', note: null }), 403);
		await expectStatusAsync(() => updateExpense(L.id, expense.id, { date: '2026-10-01', amountCents: 1, category: 'other', what: 'x', note: null, tankId: T.id }), 403);
		await expectStatusAsync(() => deleteExpense(L.id, expense.id), 403);
		expectStatus(() => addWish(L.id, T.id, wishInput), 403);
		expectStatus(() => deleteWish(L.id, T.id, wish.id), 403);
	});

	// fixed with #106
	it('can’t move the owner’s expense into a tank of their own', async () => {
		const e = addExpense(A.id, T.id, { date: '2026-10-01', amountCents: 900, category: 'plants', what: 'Moss', note: null });
		await expectStatusAsync(() => updateExpense(L.id, e.id, { date: '2026-10-01', amountCents: 1, category: 'other', what: 'mine', note: null, tankId: LX.id }), 403);
	});

	// fixed with #106
	it('can’t tick off the owner’s wish list with Add to tank', async () => {
		const w = addWish(A.id, T.id, { ...wishInput, name: 'Bucephalandra' });
		expectStatus(() => addWishToTank(L, T.id, w.id, { spend: false }), 403);
	});
});

// ── Owner-only, and the owner can ───────────────────────────────────────────

describe('owner-only actions are the owner’s', () => {
	it('lets the owner change setup, targets, public page and shares', async () => {
		expect(updateTank(A.id, T.id, { notes: 'mine' }).notes).toBe('mine');
		expect(statusOf(() => updateParams(A.id, T.id, [{ id: param.id, min: 6, max: 8, tracked: true }]))).toBeNull();
		expect(requireRole(A.id, T, 'owner')).toBe('owner');
		expect(getPublicPage(A.id, T.id).tankId).toBe(T.id);
		expect(updatePublicPage(A.id, T.id, { enabled: false })).toHaveProperty('page');
		expect(getShareForPhoto(A.id, photo.id)).not.toBeNull();
		expect(updateShare(A.id, photo.id, { includeNote: false, includeTank: true }).includeTank).toBe(true);
		expect(getExport(A.id, exportRow.id).id).toBe(exportRow.id);
	});

	it('keeps an owner’s change inside their own tank (a parameter of U is untouched by T’s targets)', async () => {
		const uParam = listParams(U.id)[0];
		updateParams(A.id, T.id, [{ id: uParam.id, min: 99, max: 100, tracked: false }]);
		expect(listParams(U.id, { all: true }).find((p) => p.id === uParam.id)).toMatchObject({ min: uParam.min, max: uParam.max, tracked: uParam.tracked });
	});

	it('won’t move an owner’s task or expense into someone else’s tank', async () => {
		expectStatus(() => updateTask(A.id, task.id, { ...task, tankId: U.id }), 404);
		await expectStatusAsync(() => updateExpense(A.id, expense.id, { date: '2026-10-01', amountCents: 1, category: 'other', what: 'x', note: null, tankId: U.id }), 404);
		// nor into a tank they only log to
		const own = createTank(L, { name: 'Logger’s second', type: 'freshwater', nominalVolumeL: 40 });
		inviteMember(own, A.email, 'log', L.id);
		await expectStatusAsync(() => updateExpense(A.id, expense.id, { date: '2026-10-01', amountCents: 1, category: 'other', what: 'x', note: null, tankId: own.id }), 403);
	});

	it('lets the owner archive the tank', async () => {
		expect(statusOf(() => setArchived(A.id, T.id, true))).toBeNull();
		setArchived(A.id, T.id, false);
	});
});

// ── 3. Tokens ───────────────────────────────────────────────────────────────

const bearer = (t: string) => `Bearer ${t}`;

describe('tokens: each kind opens only its own door, for only its own tanks', () => {
	it('an assistant token reads; it isn’t a sensor token, and the other way round', async () => {
		const a = createAssistantToken(A.id, 'Claude', [T.id]);
		const s = createAssistantToken(A.id, 'Probe', [T.id], 'sensor');
		expect(authenticateAssistant(bearer(a.token))?.user.id).toBe(A.id);
		expect(authenticateSensor(bearer(a.token))).toBeNull();
		expect(authenticateSensor(bearer(s.token))?.user.id).toBe(A.id);
		expect(authenticateAssistant(bearer(s.token))).toBeNull();
		expect(authenticateAssistant(null)).toBeNull();
		expect(authenticateAssistant(bearer('wl_not-a-token'))).toBeNull();
	});

	it('holds only the tanks picked, and only the keeper’s own', async () => {
		const second = createTank(A, { name: 'Shrimp 10', type: 'freshwater', nominalVolumeL: 38 });
		const { token } = createAssistantToken(A.id, 'Claude', [T.id]);
		expect([...authenticateAssistant(bearer(token))!.tankIds]).toEqual([T.id]);
		expect(listTanks(A.id).map((t) => t.id)).toContain(second.id);
	});

	it('can’t be made for a tank that isn’t the keeper’s: another owner’s, or one only shared with them', async () => {
		const foreign = createAssistantToken(A.id, 'Claude', [T.id, U.id]);
		expect(foreign.row.tankIds).toEqual([T.id]);
		// shared with V and L, but not theirs to hand to an assistant
		const shared = createAssistantToken(V.id, 'Claude', [T.id]);
		expect(shared.row.tankIds).toEqual([]);
		expect(authenticateAssistant(bearer(shared.token))!.tankIds.size).toBe(0);
		const sensor = createAssistantToken(L.id, 'Probe', [T.id, LX.id], 'sensor');
		expect([...authenticateSensor(bearer(sensor.token))!.tankIds]).toEqual([LX.id]);
		// nor given one afterwards
		expect(setTokenTanks(A.id, foreign.row.id, [U.id])?.tankIds).toEqual([]);
		// nor someone else's token changed
		expect(setTokenTanks(B.id, foreign.row.id, [U.id])).toBeUndefined();
	});

	it('stops working once revoked, and only its keeper can revoke it', async () => {
		const a = createAssistantToken(A.id, 'Claude', [T.id]);
		const s = createAssistantToken(A.id, 'Probe', [T.id], 'sensor');
		expect(revokeAssistantToken(B.id, a.row.id)).toBeUndefined();
		expect(authenticateAssistant(bearer(a.token))).not.toBeNull();
		revokeAssistantToken(A.id, a.row.id);
		revokeAssistantToken(A.id, s.row.id);
		expect(authenticateAssistant(bearer(a.token))).toBeNull();
		expect(authenticateSensor(bearer(s.token))).toBeNull();
	});

	it('a token for T can’t read U through the tools (the MCP and /api/v1 both go through runTool)', async () => {
		const { token } = createAssistantToken(A.id, 'Claude', [T.id]);
		const access = authenticateAssistant(bearer(token))!;
		const listed = await runTool(access, 'list_tanks', {});
		expect(JSON.stringify(listed)).toContain(T.id);
		expect(JSON.stringify(listed)).not.toContain(U.id);
		for (const tool of ['get_tank_summary', 'get_readings', 'get_history', 'get_livestock', 'get_trends', 'list_photos']) {
			await expect(runTool(access, tool, { tank_id: U.id }), tool).rejects.toBeInstanceOf(ToolError);
		}
		expect(() => photoFor(access, photoU.id)).toThrow(ToolError);
		expect(photoFor(access, photo.id).photo.id).toBe(photo.id);
	});

	it('a token loses a tank when it stops being the keeper’s', async () => {
		const mine = createTank(A, { name: 'Given away', type: 'freshwater', nominalVolumeL: 20 });
		const { token } = createAssistantToken(A.id, 'Claude', [mine.id]);
		expect(authenticateAssistant(bearer(token))!.tankIds.has(mine.id)).toBe(true);
		const { tanks } = await import('./db/schema');
		db.update(tanks).set({ userId: B.id }).where(eq(tanks.id, mine.id)).run();
		expect(authenticateAssistant(bearer(token))!.tankIds.has(mine.id)).toBe(false);
	});

	// Sensor ingestion: recordSamples(tankId, …) takes no token, so a sensor
	// token for T posting to U is refused only in the route
	// (src/routes/api/v1/[...path]/+server.ts, `access.tankIds.has(...)`).
	// That check belongs in the e2e suite; here, the token's tanks are right.
	it('a sensor token holds only its own tanks, which is what the readings route checks', async () => {
		const { token } = createAssistantToken(A.id, 'Probe', [T.id], 'sensor');
		const access = authenticateSensor(bearer(token))!;
		expect(access.tankIds.has(T.id)).toBe(true);
		expect(access.tankIds.has(U.id)).toBe(false);
	});
});

// ── 4. OAuth ────────────────────────────────────────────────────────────────
// Refresh tokens being spent once (and replays logged) is in oauth-refresh.test.ts.

const origin = 'https://waterline.example.com';
const verifier = 'v'.repeat(43) + '-security-boundaries';
const challenge = createHash('sha256').update(verifier).digest('base64url');

function signIn(redirectUri = 'https://claude.ai/api/mcp/auth_callback', tankIds = [T.id]) {
	const reg = registerClient({ client_name: 'Claude', redirect_uris: [redirectUri] });
	const client = getClient(reg.client_id)!;
	const q = new URLSearchParams({ client_id: client.id, redirect_uri: redirectUri, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256' });
	const read = readAuthorize(q, origin);
	if (!('ok' in read)) throw new Error('authorize refused');
	const code = new URL(approve(A.id, read.ok, tankIds, origin)).searchParams.get('code')!;
	return { client, code, redirectUri };
}
const form = (o: Record<string, string>) => new URLSearchParams({ grant_type: 'authorization_code', ...o });
const grantError = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		return (e as { code?: string }).code;
	}
	return null;
};

describe('credentials expire and are single-use (OAuth sign-in)', () => {
	it('a code is spent once: the second exchange is invalid_grant', async () => {
		const { client, code, redirectUri } = signIn();
		const f = form({ code, code_verifier: verifier, redirect_uri: redirectUri });
		const first = exchangeCode(client, f, origin);
		expect(authenticateAssistant(bearer(first.access_token))?.user.id).toBe(A.id);
		expect(grantError(() => exchangeCode(client, f, origin))).toBe('invalid_grant');
	});

	it('an expired code is refused', async () => {
		const { client, code } = signIn();
		expect(grantError(() => exchangeCode(client, form({ code, code_verifier: verifier }), origin, Date.now() + 11 * 60_000))).toBe('invalid_grant');
	});

	it('the PKCE verifier must match', async () => {
		const { client, code } = signIn();
		expect(grantError(() => exchangeCode(client, form({ code, code_verifier: 'w'.repeat(43) }), origin))).toBe('invalid_grant');
		expect(grantError(() => exchangeCode(client, form({ code }), origin))).toBe('invalid_grant');
	});

	it('the return address must match exactly, at sign-in and at the exchange', async () => {
		const { client, code, redirectUri } = signIn();
		expect(grantError(() => exchangeCode(client, form({ code, code_verifier: verifier, redirect_uri: `${redirectUri}/` }), origin))).toBe('invalid_grant');
		expect(grantError(() => exchangeCode(client, form({ code, code_verifier: verifier, redirect_uri: 'https://evil.example.com/cb' }), origin))).toBe('invalid_grant');
		for (const other of [`${redirectUri}?x=1`, 'https://claude.ai/api/mcp/auth_callback2', 'https://evil.example.com/cb']) {
			const q = new URLSearchParams({ client_id: client.id, redirect_uri: other, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256' });
			expect(readAuthorize(q, origin)).toHaveProperty('page');
		}
	});

	it('a code is only good for the app it was issued to', async () => {
		const { code } = signIn();
		const other = getClient(registerClient({ client_name: 'Other', redirect_uris: ['https://other.example.com/cb'] }).client_id)!;
		expect(grantError(() => exchangeCode(other, form({ code, code_verifier: verifier }), origin))).toBe('invalid_grant');
	});

	it('a code (and its token) holds only the keeper’s own tanks, whatever was posted', async () => {
		const { client, code } = signIn(undefined, [T.id, U.id]);
		const row = db.select().from(oauthCodes).all().at(-1)!;
		expect(row.tankIds).toEqual([T.id]);
		const { access_token } = exchangeCode(client, form({ code, code_verifier: verifier }), origin);
		expect([...authenticateAssistant(bearer(access_token))!.tankIds]).toEqual([T.id]);
	});

	it('an access token from sign-in stops working after its hour', async () => {
		const { client, code } = signIn();
		const { access_token } = exchangeCode(client, form({ code, code_verifier: verifier }), origin);
		expect(authenticateAssistant(bearer(access_token), Date.now() + 61 * 60_000)).toBeNull();
	});
});
