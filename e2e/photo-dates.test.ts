import { expect, test } from '@playwright/test';
import { jpeg, newKeeperWithTank, open } from './helpers';

// #42: a photo keeps the date it was taken, read from its details.
test('photos keep the date they were taken', async ({ page }, info) => {
	await newKeeperWithTank(page, `pd-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// The Photos page: two photos from last year and one without a date, in one upload.
	await open(page, '/photos');
	await page.locator('input[type=file][name=photos]').setInputFiles([
		await jpeg('#2a8c84', 'march.jpg', { at: '2025:03:08 15:20:00' }),
		await jpeg('#c8a040', 'march-2.jpg', { at: '2025:03:08 16:40:00', offset: '+02:00' }),
		await jpeg('#4060a0', 'undated.jpg')
	]);
	// one step: the dates come from the photos; the one without a date takes the first's
	await expect(page.getByRole('status')).toContainText('✓ 3 photos added');
	await expect(page.getByRole('heading', { name: /March 2025/ })).toBeVisible();
	await expect(page.locator('a.tile')).toHaveCount(3);

	// Mixed days split by day: a note per day, each photo on its own day
	await page.locator('input[type=file][name=photos]').setInputFiles([
		await jpeg('#2a8c84', 'jan.jpg', { at: '2025:01:02 09:00:00' }),
		await jpeg('#c8a040', 'feb.jpg', { at: '2025:02:03 09:00:00' })
	]);
	await expect(page.getByRole('status')).toContainText('✓ 2 photos added on 2 days');
	await expect(page.getByRole('heading', { name: /January 2025/ })).toBeVisible();
	await expect(page.getByRole('heading', { name: /February 2025/ })).toBeVisible();

	// The viewer shows the date taken, and Change date fixes it
	await page.locator('a.tile').last().click();
	await expect(page.locator('.caption .meta')).toContainText('Taken Thu Jan 2, 9:00 AM');
	await page.getByText('Change date').click();
	await page.locator('#photo-date').fill('2025-01-05');
	await page.locator('#photo-time').fill('10:30');
	await page.getByRole('button', { name: 'Save date' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Date changed');
	await expect(page.locator('.caption .meta')).toContainText('Taken Sun Jan 5, 10:30 AM');

	// A log entry: a photo from another day offers its date for the entry, without changing it by itself
	await open(page, `/entries/event/new?tank=${tankId}&category=note`);
	await page.locator('input[type=file][name=photos]').setInputFiles(await jpeg('#c8a040', 'old.jpg', { at: '2025:09:14 15:20:00' }));
	await expect(page.locator('.when')).toContainText('Now');
	await page.getByRole('button', { name: "Use the photo's date (Sep 14, 3:20 PM)" }).click();
	await expect(page.locator('.when')).toContainText('Sep 14 · 3:20 PM');
	await page.getByRole('button', { name: 'Save note' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Photo added');
	await open(page, '/photos');
	await expect(page.getByRole('heading', { name: /September 2025/ })).toBeVisible();
});
