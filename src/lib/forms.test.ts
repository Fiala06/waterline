import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@sveltejs/kit';
import { busyEnhance } from './forms';

// The save handler the forms share (#282): busy while the save is on its way,
// then the page updates (keeping what was typed unless asked), or the form's own
// handling takes the answer; busy goes off even when that throws.
type Submit = Parameters<ReturnType<typeof busyEnhance>>[0];
async function run(enh: ReturnType<typeof busyEnhance>, result: ActionResult) {
	const form = {} as HTMLFormElement;
	const after = (enh({ formElement: form } as Submit) as (o: { result: ActionResult; update: (o?: { reset?: boolean }) => Promise<void> }) => Promise<void>);
	const update = vi.fn(async (_?: { reset?: boolean }) => {});
	await after({ result, update });
	return { update, form };
}

describe('busyEnhance (#282)', () => {
	it('is busy until the answer is in, then updates keeping what was typed', async () => {
		const states: boolean[] = [];
		const { update } = await run(busyEnhance((b) => states.push(b)), { type: 'success', status: 200 });
		expect(states).toEqual([true, false]);
		expect(update).toHaveBeenCalledWith({ reset: false });
	});

	it('empties the form when asked, and runs what comes after with the form', async () => {
		const then = vi.fn();
		const { update, form } = await run(busyEnhance(() => {}, { reset: true, then }), { type: 'success', status: 200 });
		expect(update).toHaveBeenCalledWith({ reset: true });
		expect(then).toHaveBeenCalledWith(form);
	});

	it('leaves the answer to the form when it deals with it, and is never left busy', async () => {
		const handled = await run(busyEnhance(() => {}, { after: async () => true }), { type: 'redirect', status: 303, location: '/x' });
		expect(handled.update).not.toHaveBeenCalled();
		const passed = await run(busyEnhance(() => {}, { after: async () => false }), { type: 'success', status: 200 });
		expect(passed.update).toHaveBeenCalled();
		const states: boolean[] = [];
		await expect(run(busyEnhance((b) => states.push(b), { after: async () => { throw new Error('boom'); } }), { type: 'success', status: 200 })).rejects.toThrow('boom');
		expect(states).toEqual([true, false]);
	});
});
