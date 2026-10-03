import { expect, test } from '@playwright/test';
import { jpeg, newKeeperWithTank, open } from './helpers';

// Dragging the cover photo in tank Settings to choose which part shows, as on
// Facebook; the dashboard and the Tanks list show it the same way.

test('drag the cover to choose which part of it shows', async ({ page }, info) => {
	await newKeeperWithTank(page, `cover-pos-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// a 640×480 photo in a wide frame: some of it is hidden top and bottom
	await open(page, `/tanks/${tankId}/settings`);
	await page.locator('input[type=file][name=cover]').setInputFiles(await jpeg('#335577', 'cover.jpg'));
	const photo = page.getByRole('img', { name: /^Tank cover/ });
	await expect(photo).toHaveCSS('object-position', '50% 50%');
	await expect(page.getByText('✥ Drag to reposition')).toBeVisible();

	// drag it down: more of the top shows
	const box = (await photo.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 400, { steps: 8 });
	await page.mouse.up();
	await expect(photo).toHaveCSS('object-position', '50% 0%');
	await expect(page.getByText('Save changes to keep it there.')).toBeVisible();

	// the arrow keys move it too
	await photo.focus();
	await page.keyboard.press('Shift+ArrowDown');
	await page.keyboard.press('Shift+ArrowDown');
	await page.keyboard.press('ArrowDown');
	await expect(photo).toHaveCSS('object-position', '50% 22%');

	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('status').filter({ hasText: '✓ Tank saved' })).toBeVisible();
	await expect(page.getByText('Save changes to keep it there.')).toHaveCount(0);
	await expect(page.getByRole('img', { name: /^Tank cover/ })).toHaveCSS('object-position', '50% 22%');

	// kept, and shown the same way elsewhere
	await open(page, `/tanks/${tankId}/settings`);
	await expect(page.getByRole('img', { name: /^Tank cover/ })).toHaveCSS('object-position', '50% 22%');
	await open(page, '/');
	await expect(page.locator('.cover img').first()).toHaveCSS('object-position', '50% 22%');
	await open(page, '/tanks');
	await expect(page.locator('.cover img').first()).toHaveCSS('object-position', '50% 22%');
});

// Choose from photos: one of the tank's own photos becomes the cover, saved with the form.
test('choose the cover from the tank’s photos', async ({ page }, info) => {
	await newKeeperWithTank(page, `cover-pick-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, '/photos');
	await page.locator('input[type=file][name=photos]').setInputFiles([await jpeg('#2a8c84', 'one.jpg', { at: '2026:03:08 15:20:00' }), await jpeg('#c8a040', 'two.jpg', { at: '2026:04:01 09:00:00' })]);
	await expect(page.getByRole('status')).toContainText('✓ 2 photos added on 2 days');

	await open(page, `/tanks/${tankId}/settings`);
	await expect(page.getByRole('img', { name: /^Tank cover/ })).toHaveCount(0);
	await page.getByRole('button', { name: 'Choose from photos' }).click();
	const choices = page.locator('.pick-one');
	await expect(choices).toHaveCount(2);
	await choices.filter({ hasText: 'Mar 8' }).click();
	// previewed at once, with its pick outlined, and saved with the form
	const cover = page.getByRole('img', { name: /^Tank cover/ });
	await expect(cover).toBeVisible();
	const src = await cover.getAttribute('src');
	expect(src).toMatch(/\/media\/[0-9a-f-]+$/);
	await expect(page.getByText('Save changes to keep it there.')).toBeVisible();
	await page.getByRole('button', { name: 'Save changes' }).first().click();
	await expect(page.getByRole('status')).toContainText('✓ Tank saved');
	await expect(page.getByRole('img', { name: /^Tank cover/ })).toHaveAttribute('src', src!);
	await expect(choices.filter({ hasText: 'Mar 8' })).toHaveClass(/on/);
});
