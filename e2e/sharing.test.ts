import { expect, test } from '@playwright/test';
import { jpeg, linkIn, newKeeperWithTank, open, waitForMail } from './helpers';

// #22: the owner shares a tank; the helper logs to it; History says who; the viewer only looks.
test('share a tank with someone', async ({ page, browser }, info) => {
	const ownerEmail = await newKeeperWithTank(page, `share-owner-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// Setup › Sharing: invite someone who isn't on the server yet
	await open(page, `/tanks/${tankId}/sharing`);
	await expect(page.getByRole('heading', { name: /People with access · 1/ })).toBeVisible();
	const helperEmail = `share-helper-${Date.now()}@example.com`;
	await page.getByLabel('Email').fill(helperEmail);
	await page.getByLabel('Role').selectOption('log');
	await page.getByRole('button', { name: 'Send invite' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Invitation sent' })).toContainText(`✓ Invitation sent to ${helperEmail}`);
	await expect(page.getByText("hasn't joined yet · can log care")).toBeVisible();
	const mail = await waitForMail(helperEmail, (m) => m.subject.includes('shared Riverbed 40 with you'));
	const link = linkIn(mail, '/share/');

	// The helper accepts in their own browser: the tank is in their list, and they can log to it
	const them = await browser.newContext();
	const theirs = await them.newPage();
	await theirs.goto(link);
	await expect(theirs.getByRole('heading', { name: /shared Riverbed 40/ })).toBeVisible();
	// signing in as the invited address accepts; a new account goes through setup first
	await theirs.getByRole('button', { name: /to accept$/ }).click();
	await expect(theirs).toHaveURL(/\/setup$/);
	await theirs.getByRole('button', { name: /Skip/ }).click();
	await theirs.goto(link);
	await expect(theirs).toHaveURL(new RegExp(`tank=${tankId}`));
	await theirs.goto(`/tanks`);
	await expect(theirs.getByText(/Shared by .* · can log/)).toBeVisible();
	// no Setup tab, and setup pages are the owner's
	await theirs.goto(`/?tank=${tankId}`);
	await expect(theirs.getByRole('link', { name: 'Setup' })).toHaveCount(0);
	const refused = await theirs.request.get(`/tanks/${tankId}/settings`);
	expect(refused.status()).toBe(403);
	// logging works
	await theirs.goto(`/entries/event/new?tank=${tankId}&category=note`);
	await theirs.locator('html[data-ready="true"]').waitFor();
	await theirs.getByLabel('Note').fill('Fed them while you were away');
	await theirs.getByRole('button', { name: 'Save note' }).click();
	await expect(theirs.getByRole('status')).toContainText('✓ Note saved');

	// The owner sees who logged it, and the helper in People with access
	await open(page, '/history');
	await expect(page.getByText(/Fed them while you were away/).first()).toBeVisible();
	await expect(page.getByText(/· by share-helper/).first()).toBeVisible();
	await open(page, `/tanks/${tankId}/sharing`);
	await expect(page.getByRole('heading', { name: /People with access · 2/ })).toBeVisible();

	// Down to Can view: no Log button, and a save is refused
	await page.getByLabel(`Role for ${helperEmail}`).selectOption('view');
	await expect(page.getByRole('status')).toContainText('can view');
	await theirs.goto(`/?tank=${tankId}`);
	await theirs.locator('html[data-ready="true"]').waitFor();
	await expect(theirs.getByRole('button', { name: 'Log', exact: true })).toHaveCount(0);
	await expect(theirs.getByRole('link', { name: /Log water test/ })).toHaveCount(0);
	const refusedLog = await theirs.request.get(`/entries/test/new?tank=${tankId}`);
	expect(refusedLog.status()).toBe(403);

	// Remove, with Undo
	await page.getByRole('button', { name: `Remove ${helperEmail}` }).click();
	await expect(page.getByRole('status')).toContainText(`${helperEmail} removed`);
	await theirs.goto(`/tanks`);
	await expect(theirs.getByText('Riverbed 40')).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('status')).toContainText('is back');
	await expect(page.getByRole('heading', { name: /People with access · 2/ })).toBeVisible();
	await them.close();
	void ownerEmail;
	void jpeg;
});
