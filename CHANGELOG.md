# Changelog

What's new in Waterline, newest first. The app shows this list under Settings › What's new, and the first lines of a release once on the dashboard after an update, so write for the people who use it: a few plain-language lines, each starting with its name in bold.

A release heading is `## <version> · <date>`, with the version in `package.json` (a test checks the newest release matches it). Anything under another heading, like `## Unreleased`, isn't shown.

## Unreleased

- **Connect an AI assistant:** let Claude, ChatGPT or another assistant read the tanks you pick, to answer questions about your readings, History, livestock and photos. Make an access token in Settings › AI assistant and paste it into the assistant; it can't change anything, and you can revoke it any time. Waterline stores no AI keys.
- **Spending:** each tank has a Spending tab for what it costs (livestock, plants, equipment and consumables): this month, this year and all time, the year by category, and month by month. Buying a saved product again logs in one step from Settings › Products, and the currency is in Settings › Units.
- **Receipts:** attach a photo or PDF receipt to an expense. They're in your backup too.
- **More trends:** the dashboard also points out what keeps happening, like "KH drifts down about 1 dKH a week between water changes" or "pH dips about 0.2 after dosing Excel", only when it happens most times and more than it changes anyway. The daily or weekly digest has these under Worth a look.
- **Compare tanks:** Charts shows the same parameter in your other tanks, on the same dates, under the chart.
- **Notes on the tank's page:** its pinned note, then the latest dated notes, with Add note right there.
- **Remind me:** a one-off reminder about a tank in two taps, from its page or the dashboard: tomorrow, in 3 days, next week, in 2 weeks, or on a date.
- **Where it came from, editable:** an animal's page now has its Source (the store or breeder), to fix or fill in later.
- **Custom parameters, again:** adding one offers those from your other tanks, added in one tap with their unit and targets.

## 1.3.0 · 2026-09-27

- **Pet names and photos:** give a fish or any animal a name. Name one of a group and it gets its own entry ("Pepper · Corydoras"), shown by name on the Livestock tab, the dashboard and in History, with its own page for a profile photo, notes, its history and every photo it's in. Tag pets from any photo under In this photo. Public pages show the species only, and hide photos with pets in them, unless you turn on Pet names and photos.
- **Importing, easier:** when a spreadsheet's columns have other names, pick which is which on the preview instead of renaming them. And one file can hold several kinds of entry (water tests, water changes, doses and more), with a Type column saying what each row is. It's undone in one step, like any import.
- **Your own profile photo:** add one in Settings › Profile, from your camera or photos, with a preview before it's saved. Signing in with Google doesn't replace it; Use my Google photo switches back, and Remove photo shows your initials.

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
