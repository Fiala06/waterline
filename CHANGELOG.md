# Changelog

What's new in Waterline, newest first. The app shows this list under Settings › What's new, and the first lines of a release once on the dashboard after an update, so write for the people who use it: a few plain-language lines, each starting with its name in bold.

A release heading is `## <version> · <date>`, with the version in `package.json` (a test checks the newest release matches it). Anything under another heading, like `## Unreleased`, isn't shown.

## 1.2.0 · 2026-09-27

- **Works behind more proxies:** signing in no longer ends in *502 Bad Gateway* when Waterline runs behind nginx, such as Nginx Proxy Manager, with its default settings.
- **Account menu:** your profile photo from Google, or your initials, in the upper left: tap it for your settings, What's new and signing out.
- **Logs for troubleshooting:** Settings › Server settings › Logs shows what went wrong, like emails that didn't send, imports that couldn't be read and sign-in problems, and a page that fails shows a reference to look up there. More detail when you need it, and a download to share.
- **Easier-to-read charts:** the parameter and its unit up the side, dates along the bottom, and a reading's value, status, date and time when you hover or tap the line, or step through them with the arrow keys.

## 1.1.0 · 2026-09-27

- **Import History from a spreadsheet:** past water tests, water changes, doses, maintenance, observations and notes, with a template for each and a preview before anything is added. Start one from History, Quick add or Settings › Import & export; any import can be undone in one step.
- **Import livestock, plants and equipment** from a spreadsheet, from each list.
- **Latest readings in one row** on a computer, each with a small line of its recent readings. Hover a short name like NH₃ to see the full name.
- **Spotting trends:** a note under the dashboard's chart when a reading has risen or fallen in each of your last tests, or is on course to pass its target.
- **Faster water tests:** Use last readings fills in your previous test, Also log a water change saves both at once, and you can add a parameter without leaving the test.
- **Quicker backdating:** 1 hour ago, This morning and Yesterday evening in the date and time picker.
- **Saved product links** in Settings › Products: one tap to reorder, and a Reorder link when you dose one.
- **Tips:** an ⓘ beside each parameter, and beside a few less obvious fields, explains what it is.
- **Summary for an AI assistant:** a tank's readings, care log and stocking as text to paste into a chat, from its Overview or Settings › Import & export.
- **Easier to set up:** a new server needs only its address. The first page asks for a setup code from the server's log, then Google sign-in, who can sign in, the admin's login and a few switches are all in Settings › Server settings.
- **What's new:** this list, in Settings, and a note on the dashboard after each update.
- **Smaller things:** a log entry you leave unsaved is kept for when you come back; species search finds the names people use; saving works with ad blockers turned on; new category icons, with one for plants; and now and then a small fish swims through the logo.

## 1.0.0 · 2026-09-26

- **First release:** log water tests at the tank and see each parameter against its target at a glance.
- **Tanks** with their own parameters and targets, set up for freshwater, planted, brackish or reef.
- **History, charts and photos** of everything logged: tests, water changes, dosing, maintenance, livestock, equipment, observations and notes.
- **Tasks and reminders** for water changes and upkeep, by email one at a time or in a daily or weekly digest, with alerts when a reading is out of range.
- **Livestock, plants and equipment** for each tank, with a built-in species list.
- **A public page** to share a tank, and share links for photos.
- **Your data and the app:** a full backup or a CSV of water tests, and an app for your home screen that logs offline and syncs later.
