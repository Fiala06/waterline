import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #88: each kind of tank event is its own overlay on Charts. Water changes show
// by default; the rest are switched on in the legend, and the choice sticks.
test('event overlays on Charts switch on and off, and the choice is remembered', async ({ page }, info) => {
	await newKeeperWithTank(page, `overlay-${info.project.name}`, 'Freshwater');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

	// two tests, so there is a line; three events straight to the log form
	await open(page, `/tanks/${tankId}/import/tests`);
	await page.locator('input[type=file][name=file]').setInputFiles({
		name: 'tests.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(`Date,Time,Nitrate\n${day(10)},09:00,10\n${day(1)},09:00,30\n`)
	});
	await page.getByRole('button', { name: 'Add 2 water tests' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Imported 2 water tests');
	const origin = new URL(page.url()).origin;
	const log = async (category: string, fields: Record<string, string>) => {
		const res = await page.request.post(`/entries/event/new?tank=${tankId}&category=${category}`, {
			headers: { origin, 'x-sveltekit-action': 'true' },
			multipart: { date: day(5), time: '10:00', ...fields }
		});
		expect((await res.json()).type, category).toBe('redirect');
	};
	await log('water_change', { amountMode: 'percent', amount: '30' });
	await log('maintenance', { actions: 'Trimmed plants' });
	await log('equipment', { action: 'adjusted', item: 'LED light' });

	await open(page, `/charts?tank=${tankId}`);
	const legend = page.locator('.legend');
	const markers = page.locator('.chart-card .marker');
	await expect(legend.getByRole('button', { name: 'Water change' })).toHaveAttribute('aria-pressed', 'true');
	await expect(legend.getByRole('button', { name: 'Plant trim' })).toHaveAttribute('aria-pressed', 'false');
	await expect(legend.getByRole('button', { name: 'Light change' })).toHaveAttribute('aria-pressed', 'false');
	await expect(legend.getByRole('button', { name: 'Dosing' })).toHaveCount(0); // nothing dosed: no switch
	await expect(markers).toHaveCount(1);
	await expect(page.getByRole('heading', { name: 'Events in range · 1' })).toBeVisible();

	await legend.getByRole('button', { name: 'Plant trim' }).click();
	await expect(markers).toHaveCount(2);
	await expect(page.getByRole('heading', { name: 'Events in range · 2' })).toBeVisible();
	await expect(page.locator('.chart-card .marker.trim')).toHaveCount(1);
	await legend.getByRole('button', { name: 'Water change' }).click();
	await expect(markers).toHaveCount(1);

	// the switches are remembered on this device
	await open(page, `/charts?tank=${tankId}`);
	await expect(legend.getByRole('button', { name: 'Plant trim' })).toHaveAttribute('aria-pressed', 'true');
	await expect(legend.getByRole('button', { name: 'Water change' })).toHaveAttribute('aria-pressed', 'false');
	await expect(markers).toHaveCount(1);
});
