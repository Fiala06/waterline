// What a Waterline backup holds (#306): written into every backup as its
// manifest, shown on Settings › Import & export, and read back by Restore.

/** The backup format's version: 1 before the manifest; 2 adds it, and wishes, routines, plan runs, PAR readings and test kits. */
export const BACKUP_VERSION = 2;
/** The versions Restore reads. */
export const RESTORABLE_VERSIONS = [1, 2];

/** In the backup, and put back by Restore into new tanks of your own. */
export const BACKUP_INCLUDES = [
	'Tanks, with their details, parameters and targets',
	'Water tests and their readings',
	'History: water changes, doses, maintenance, notes, health and every other entry',
	'Tasks and routines, with when each was done',
	'Livestock, plants and equipment, and what the dosers put in',
	'Photos (full size) and which pets are in them',
	'Spending, with receipts',
	'Wish list, maintenance routines, fertilizer and treatment plans, PAR readings'
];

/** In the backup for your own records, but not put back by Restore. */
export const BACKUP_NOT_RESTORED = ['Your settings, notification choices, products, favorites and test kits: set them again in Settings'];

/** Left out of the backup on purpose, with why. */
export const BACKUP_EXCLUDES = [
	'Sharing: who a tank is shared with, its public page and photo links (a restored tank is private)',
	'Passwords, tokens and keys: sensor and AI assistant tokens, the calendar link, push devices and ntfy',
	'Connections to devices on your network: ESPHome devices and Shelly plugs (set up again after a restore)',
	'Readings sent in by sensors and controllers (they can run to millions)',
	'Your dashboard layout and the undo history of spreadsheet imports'
];

export function backupManifest() {
	return { version: BACKUP_VERSION, includes: BACKUP_INCLUDES, notRestored: BACKUP_NOT_RESTORED, excludes: BACKUP_EXCLUDES };
}

/** The README.txt inside a backup. */
export function backupReadme(stamp: string): string {
	const list = (xs: string[]) => xs.map((x) => `  - ${x}`).join('\n');
	return `Waterline backup — ${stamp} (format ${BACKUP_VERSION})

waterline.json   everything below, with a manifest of what's in it
water-tests.csv  one row per water test, in your units
photos/          full-size photos, by tank
receipts/        receipts for spending, by tank

To put it back, on this server or another: Settings › Import & export ›
Restore a backup. It adds the tanks as new, private tanks of your own and
never changes or removes what's already there.

In this backup, and restored:
${list(BACKUP_INCLUDES)}

In this backup, not restored:
${list(BACKUP_NOT_RESTORED)}

Not in this backup:
${list(BACKUP_EXCLUDES)}
`;
}
