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
