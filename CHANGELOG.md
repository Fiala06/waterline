# Changelog

What's new in Waterline, newest first. The app shows this list under Settings › What's new, and the first lines of a release once on the dashboard after an update, so write for the people who use it.

How to write a line:
- Start with the feature's name in bold, then say in a sentence or two what it does for the keeper and where to find it.
- Link the place it lives: `[Settings › Calendar](/settings#calendar)`, `[Charts](/charts)`. A tank's page is `/tanks/current/…` (such as `/tanks/current/spending`), which opens it for the tank you're on. The line's first link is also where its name leads from the dashboard's What's new. Links to other sites are `https://…`; any other kind is shown as plain text. GitHub's release notes show the words without the in-app links.
- Plain words, no internals: what someone sees and can do, not how it's built.

A release heading is `## <version> · <date>`, with the version in `package.json` (a test checks the newest release matches it). Anything under another heading, like `## Unreleased`, isn't shown.

## Unreleased

- **The summary knows the new things too:** [Share summary](/tanks/current/summary) (and what an AI assistant reads) now carries each equipment item's schedule ("runs 08:00–12:00, 14:00–18:00 · 8 h"), what the tank goes without on purpose, the latest reading from each sensor, a reef's PAR readings by spot, and the wish list as Planned to add, beside the species care it already had.
## 1.12.2 · 2026-10-03

- **Uploading photos is one step:** On [Photos](/photos), Upload adds the photos as soon as you've chosen them, each on the day it was taken (today when a photo doesn't say, and the toast tells you: "✓ 2 photos added · dated today"); there's no second Save to forget. The empty tab says the same with an Upload photos button, and Change date in a photo's viewer still fixes a date afterwards.
- **The reminder box on a log form says what it does:** Under [Log water change](/entries/event/new?category=water_change) and Log water test, the box now reads "Also mark the reminder “Water change 25%” done", with where the reminder stands under it ("Due today · next Oct 10", "Not due until Oct 6 · next would be Oct 13"). It's ticked by itself when the reminder is due or you came from Mark done, and left for you to tick when you're doing it early.
- **% or gallons, the way you logged it last:** [Log water change](/entries/event/new?category=water_change) opens in % or in your volume unit, with the amount filled in, the way the tank's last water change was logged; the first one still starts at 25%.

## 1.12.1 · 2026-10-03

- **Sign out everywhere signs them out for good:** [Server settings › People](/settings/server/people) › Sign out everywhere used to hold only for a second, because a session's start time moved with every request; it now stays put, so the person is asked to sign in again on their next request, whenever that is.
- **A cover from the photos you already have:** On [Tank details](/tanks/current/settings), Choose from photos lists the tank's photos under the cover; pick one and it shows at once, ready to drag into place and save with the rest. Change cover still takes a new upload, and Set as cover in a photo's viewer works as before.
- **Logging a water change clears its reminder again:** When a water change you'd started earlier and left unsaved came back on [Log water change](/entries/event/new?category=water_change), it unticked "Also complete task", so the change was logged but the reminder stayed due. What comes back no longer touches that box: it's ticked whenever the reminder is due today or you came from Mark done.

## 1.12.0 · 2026-10-03

- **Species care ranges and what to check:** The server downloads care data for the fish in the species list from FishBase (temperature, pH and hardness ranges, adult size, whether it schools), by itself the first time it runs or with Download now under [Server settings › Features](/settings/server#species-care); FishBase is CC BY-NC, so the data is never part of Waterline itself, lives in `/data`, and is credited where it's shown. [Livestock](/tanks/current/livestock) gets a Worth checking list where a tank's targets fall outside a species' range ("Your tank's temperature target (26–30 °C) is outside the Neon tetra's range (20–26 °C)"), a schooling species is kept in fewer than six, or two species are a well-known bad match (bettas and guppies, angelfish and neon tetras, loaches and pet snails: a short, cautious list). The same shows under the species as you add livestock, on an animal's page with its ranges, in the Share summary and to an AI assistant. Without internet, or with the switch off, nothing changes.
- **Tank timeline:** [Timeline](/timeline) (Timeline on [Photos](/photos), in the tank's More ▾ menu and in More on a phone) lines up a tank's photos by the day they were taken, month by month, each with the day since setup, how many animals and plants were in the tank and the nearest water test's readings with their ✓ ▲ ✕ status. Between two photos it says how long passed and what changed ("+6 Otocinclus · 3 water changes · trimmed Rotala · nitrate 20 → 10 ppm"). Compare picks two photos for a before and after, side by side and with a slider, with the readings of each and everything that happened in between. A close-up that doesn't show the tank is left out from its photo page. The tank's [public page](/tanks/current/public) gets a Timeline switch, which follows the page's readings, pet names, livestock and activity switches.
- **Wish list:** Every tank has a [Wish list](/tanks/current/wishlist) (Wish list on the Livestock, Plants and Equipment tabs, in the tank's More ▾ menu, and in More on a phone) for the fish, inverts, corals, plants and equipment you plan to add, picked from the species list, with how many, a note, a price and a link to the shop. The heading adds it up ("Planned · 3 · about $62"). Add to tank puts an item in Livestock, Plants or Equipment today with the usual History entry, and logs the purchase in [Spending](/tanks/current/spending) at its price or what you paid; it then sits under Added to the tank. Delete has Undo. People a tank is shared with see the list, only the owner changes it.
- **Readings from sensors and controllers:** [Settings › Sensors](/settings/sensors) makes a token for a temperature probe, ESPHome, Node-RED, Home Assistant or a controller like an Apex, which may only add readings to the tanks you pick, with copy-and-paste examples. They post to the API and their readings stay apart from your water tests: a thin line under the tests in [Charts](/charts) with the latest as Live, and "● Live 25.4 °C · 2 min ago" on the tank's readings. One reading a minute per parameter is kept, for a year, and they never raise an alert by themselves. An AI assistant's readings tool sees the latest sensor value too.
- **Test kits with timers:** [Settings › Test kits](/settings/test-kits) keeps each kit's steps, one per line, with its shakes and waits ("Shake 30 s", "Wait 5 min"); API's Freshwater Master and GH & KH kits are there as presets to start from. On [Log water test](/entries/test/new), Start beside a parameter walks the steps; a timed step counts down in the row while you do the other readings, several at once, and chimes and buzzes when time's up. The screen stays awake while a timer runs.
- **Share a tank with someone:** [Setup › Sharing](/tanks/current/sharing) (also Share with someone in the tank's More ▾ menu) invites a partner, a classroom helper or a fish-sitter by email, as Can log care (tests, water changes, dosing, notes, photos and tasks done) or Can view. They accept from the email, or straight away when they're on the server already, and the tank sits beside their own. Only you change setup, targets and sharing or archive it. People with access lists everyone with a role to change and Remove (with Undo), and Reminders & alerts says whether task reminders and out-of-range alerts go to everyone who can log or only to you. Once a tank is shared, [History](/history) says who logged each entry.
- **Invite people to your server:** [Server settings › People](/settings/server/people) sends an invitation to an email address: an email with an Accept link (or a link to copy when email isn't set up), good for 7 days, which the person accepts by signing in with Google as that address. Who can sign in gets a fourth choice, Invited people only, and invitations also count beside a list. The same page lists everyone on the server with how they sign in, when they joined and were last seen and how many tanks they have, with Make admin, Sign out everywhere and Remove (after a confirmation that says what goes), and every invitation with Resend and Revoke. Each change is in the Logs.
- **Lights, CO₂ and pumps on a schedule:** Any item on [Equipment](/tanks/current/equipment) can run On a schedule: as many on / off periods a day as it needs (a light with a midday siesta, CO₂ an hour before the lights, a wavemaker at night), and lights can ramp up and down. The tab draws the day as a timeline with the time now marked, and each card says "● On now · off at 12:00" or "○ Off · on at 14:00". The light's schedule sets the tank's lights times and photoperiod in [Tank details](/tanks/current/settings) and on the dashboard, and every change to a schedule is kept in [History](/history), so algae or a pH swing can be traced to it. Reef tanks get PAR readings on the Equipment tab, placed on a map of the tank seen from above.
- **Calculators:** [Calculators](/calculators) (in the tank's More ▾ menu, `⌘K`, and More on a phone) works out the tank's volume from its size, with Save as the tank's water volume; how much water to change to bring nitrate (or any reading) down to a target, in % and in your volume unit; what a dose of a product adds in ppm and the dose for a target, from a strength you can save with a product under [Settings › Products](/settings/products); the heater size for the tank and room; how much substrate to buy; CO₂ from pH and KH, with the pH to aim for; and the baking soda, gypsum and Epsom salt to bring RO water up to a GH and KH. Everything starts from the tank's size, volume and latest readings, in your units, and [Tank details](/tanks/current/settings) and Log a dose link to the one that helps there.
- **Photos keep the date they were taken:** A photo you add is dated when it was taken, read from the photo itself, not when you uploaded it, so last month's photos land in last month in [Photos](/photos) and History. On the Photos page, Upload shows a Taken date set from the photos (or today), and photos from different days each keep their own, as one note per day. On a log entry, a photo from another day offers "Use the photo's date" for the entry. Opening a photo shows when it was taken, and Change date fixes it. The photo's other details (camera, location) are still not kept.
- **Equipment reminders keep their name:** Renaming an item on [Equipment](/tanks/current/equipment) renames its service reminder in [Tasks](/tasks) too, without moving its due date or clearing a snooze.

## 1.11.1 · 2026-10-03

- **Bigger charts on a computer:** In [Charts](/charts), up to a 1440px-wide window the latest reading, averages and events move under the chart, so the chart gets the full width. The charts of the same reading in your other tanks are now wide and tall enough to read.
- **Copy a water test:** Open a water test in [History](/history) and Copy puts its readings on the clipboard as plain text, one a line ("pH 7.8", "Nitrate 40 ppm") under the tank and the time, without the statuses, ready to paste into a message.
- **No heater, on purpose:** On a tank's [Equipment](/tanks/current/equipment), Goes without marks a tank as having no filter, heater, light or CO₂, so it reads as a choice, not something missing. It shows with the equipment on the tank's page, its public page and the setup review, and goes by itself when you add one.
- **Water tests open on the public page:** On a tank's [public page](/tanks/current/public), tapping a water test in the Log shows its readings, each with its status. Its note stays private, and nothing opens when the page hides readings.
- **Targets from the water test:** On [Log water test](/entries/test/new), Edit targets and parameters opens the tank's targets, where you change a parameter's range or which ones you test. Save there brings you straight back to your test, with what you'd typed still in it.
- **Older History is never out of sight:** [History](/history) still opens on the last 30 days, but it now says how many older entries there are ("70 entries · 183 older") and ends with Show all time. A range with nothing in it says so and offers the same. The range you pick is remembered, so choosing All time once keeps it.

## 1.11.0 · 2026-10-03

- **Readings and tasks apart in the menu:** Beside each tank in the side menu, readings out of range show as `✕ 1` in red and overdue tasks as `▲ 1`, both when there are both; hovering spells it out ("1 reading out of range · 1 task overdue"). Searching with `⌘K` shows the same.
- **Snooze any task:** In [Tasks](/tasks), every task has Snooze ▾, not only those due within a day; one that isn't due yet moves back from its due date.
- **The water change once:** On the [dashboard](/), when Needs attention lists the water change with Done, Due no longer lists the same task again.
- **Change since the last test:** In [Charts](/charts), the Change figure says since when ("+17 since Sep 29"), the date of the reading before, instead of a count of days.
- **Share summary:** The tank's Get help button and the `⌘K` action are now Share summary, which opens the same summary page to copy for a forum, a friend, your fish store or an AI chat. More on a phone still says Get help.
- **Notes & routines in Setup:** The page with a tank's specs, pinned note, latest notes and routines is now [Notes & routines](/tanks/current) in the Setup menu, instead of Tank details under More, and the same sections sit at the end of [Setup › Details](/tanks/current/settings#details-more) under the form, with Edit scrolling up to it. Setup › Reminders is now Remind me, as the page is.
- **Tank tabs on a phone:** Every tank page on a phone shows the row of tabs (Overview, Charts, History, Photos, Livestock, Plants, Equipment, Spending, Setup) with the current one scrolled into view, so each is one tap away.
- **Alerts read everywhere:** Which alerts you've marked read in the bell is kept on your account, so a phone and a computer agree.
- **Spending by category or month:** On [Spending](/tanks/current/spending), tapping a category bar or a month bar shows only those expenses, with a "Showing: Equipment · clear" line over the list.
- **Day and since, once each:** The tank header says "Day 201 · since Mar 2026"; the tank's Setup pages say "since Mar 2026".
- **Plants without a pointless column:** The Added column on [Plants](/tanks/current/plants) shows only when the plants were added on different days.
- **Set as cover, with Undo:** On a photo, Set as cover says "✓ Cover set" with an Undo that puts the cover before back.
- **Preview page waits for the page:** On [Public page settings](/tanks/current/public), Preview page is greyed out while the page is off, with "Turn the page on first" when you hover it.
- **Hover only with a mouse:** Buttons and rows no longer stay in their hover state after a tap on a phone or tablet.
- **Service reminders on equipment:** Each item on [Equipment](/tanks/current/equipment) can have a Service reminder: every 2 weeks, monthly, every 3 or 6 months, or your own number of days, set when you add or edit it. Its card says "Service due in 12 days" or "✕ Service overdue 3 days", and logging a service (or Serviced today on the setup review) marks it done, so it's due again a cadence later.
- **Lights and CO₂ times:** [Tank details](/tanks/current/settings) has Lights on / off and CO₂ on / off; the photoperiod is worked out from the lights' times ("8 h"). The dashboard's In the tank shows "Lights 08:00–16:00 · CO₂ 07:00–15:00", and the setup review lists them.
- **A tank that's still cycling:** Tick "This tank is still cycling" when adding a tank or in [Tank details](/tanks/current/settings). While it is, ammonia and nitrite above target show as ▲ Cycling rather than ✕ High, the [dashboard](/) opens with a Cycling panel (ammonia, nitrite and nitrate side by side, and a line on which stage the cycle is at), and its public page says Cycling. Once ammonia and nitrite have read 0 for three tests it suggests Mark as running, which adds a "Cycle complete" note to History.
- **Test every:** [Parameters & targets](/tanks/current/targets) has a Test every column (3 days, a week, 2 weeks, a month, 3 months). A reading older than that shows "▲ – 23 days ago · due" on its [dashboard](/) tile, and a "Due a test: KH (23 days), GH (40 days)" line under In range opens the water test.
- **TDS, conductivity and ORP:** New tanks start with TDS (ppm) and Conductivity (µS/cm) targets on freshwater, planted and brackish presets, so a daily TDS pen reading or a remineralised RODI mix has a place on the water test, and reef tanks get ORP (mV). A tank you already have keeps its own list; add them from [the tank's settings](/tanks/current/settings), where Reset to defaults picks them up too.
- **Log a feeding by hand:** Feeding is one of the types on the [log form](/entries/event/new?category=feeding), beside Test, Water change and the others: the food (recent ones one tap away), the amount and its unit (pinches, cubes, mL, g or your own word). History shows it as "Fed 2 pinches of Micro pellets", the same as a feeding routine's Done writes.
- **What went into a water change:** Under the amount and source water, Add conditioner or remineraliser takes the product, the amount and its unit (recent products suggested); History and the entry show it, as in "Water change · 25% · Tap · Prime 2.5 mL".
- **Every log type in one row:** The log form's types sit in one wrapping row (Test, Water change, Dose, Feeding, Maintenance, Note, Observation, Livestock / plants, Equipment, Health), the current one in red, instead of four and a More. Health leads to the health entry. On a computer the Quick add sheet from More… under Log water test ▾ lists only the types the menu doesn't (Feeding, Maintenance, Livestock / plants, Equipment, Observation, Health, Import a spreadsheet); on a phone the Log button still has every kind.
- **Fish health:** Log what you see on an animal and how it's going: open Health on the [Livestock](/tanks/current/livestock) tab or Log health on an animal's page, tick the animals, pick the symptoms (white spots, clamped fins, not eating, gasping and more), name the treatment and say how it stands: watching, treating, recovered or lost. Losing one animal can take 1 off its count at the same time. Each animal's page keeps its health timeline, and an animal still being watched or treated shows ▲ Under treatment there and in the Livestock table. The entries are in History too.
- **Treatment courses:** A recurring task or routine can now end: in [Tasks](/tasks), set Ends to a date or to a number of times ("5 doses"), and the list says what's left ("3 doses left · ends Oct 9"). The last one marked done finishes it, with a note in History. From a health entry, Save and start a treatment course opens a dosing routine already filled in with the treatment, every other day for ten days.
- **Locked down a little more:** The app now tells browsers to run scripts only from your server (and Google's tag when analytics is on), never to show Waterline inside another site's frame, and that it doesn't use the camera, microphone or location. Check the link works refuses internal addresses. Two libraries with known problems are updated.
- **Easier to read:** Red text (links, the active tab, ✕ states) is a deeper red in the light theme and a lighter one in the dark theme, and buttons' red is a shade darker, so every word meets the contrast guideline; faint hints are a little darker too. Keyboard users get a Skip to content link, the Plants table reads correctly to a screen reader, and the Copy buttons on the AI assistant page are easier to tap.
- **The bottom bar gets out of the way:** On a phone, the bar with Overview, Charts, Log, History and More slides away while you scroll down a page and comes back as soon as you scroll up or reach the top. Log's label sits under its button instead of behind it.
- **Sheets stay put on a phone:** With Log, Snooze or any other sheet open, scrolling no longer moves the page behind it; only the sheet scrolls.
- **More of the tank on its public page:** Visitors to a [public page](/tanks/current/public) now choose how much to see: the trend chart over 30 days, 90 days, 1 year or all time, for every tested parameter rather than three, and the log for the last week, the last month or everything. The owner's switches still decide what's shown at all.
- **Check the link works:** On a tank's [Public page settings](/tanks/current/public), Check the link works fetches your public address from the server and says whether it answered with the page, or why not: a wrong Public site URL, a proxy sending visitors elsewhere, a 404, no DNS, a refused connection or a certificate problem. It can't see a firewall between the internet and your server, so it also suggests opening the link on a phone with Wi-Fi off.

## 1.10.0 · 2026-10-03

- **A new look, and a tank workspace:** Waterline has a fresh design: one typeface throughout, square corners, and red kept for what matters. On a computer, your tanks sit in a menu on the left (press `[` to keep it open or let it tuck away), and each tank is a workspace with tabs for [Overview](/), [Charts](/charts), [History](/history), [Photos](/photos), [Livestock](/tanks/current/livestock), [Plants](/tanks/current/plants), [Equipment](/tanks/current/equipment), [Spending](/tanks/current/spending) and [Setup](/tanks/current/settings). Log water test is one click or the `T` key away from anywhere, with the other log types under its ▾; `W`, `D` and `N` log a water change, a dose or a note. Press `⌘K` (or `/`) to jump to any tank, tab or action, `?` for every shortcut, `G` then a letter to switch tabs. The bell lists readings out of range and overdue tasks across your tanks. On a phone, the bottom bar has Overview, Charts, a big Log button, History and More.
- **Review tank setup:** Every 3 months, a Review tank setup task comes up in [Tasks](/tasks) and on the dashboard, in case something changed and wasn't updated: a new light timer, a heater swapped, fish rehomed. It shows the tank's details, equipment, target ranges, and livestock and plants, each with Still right or Edit. A filter or pump not serviced in 6 months gets a Serviced today button. All still right finishes it, with an entry in History. Change how often, or turn it off, in [the tank's settings](/tanks/current/settings#review).

## 1.9.1 · 2026-10-01

- **Due, without the nudge:** On the [dashboard](/), a task that isn't due yet says how soon ("In 3 days", "Tomorrow") and its button is a quiet Done early, so only what's due today or overdue asks to be marked done.
- **In range, one tile each:** On the [dashboard](/), each reading that's fine has its own tile, its name above its value, so they no longer run together.
- **A still waterline again:** The line under the tank's photo is back to the plain line.

## 1.9.0 · 2026-10-01

- **A living waterline:** The line under the tank's photo on the [dashboard](/) ripples, slowly.
- **Charts that draw themselves:** Trend lines on the [dashboard](/) and in [Charts](/charts) draw in the first time you see them, and water changes on the timeline are little drops.
- **A splash for Mark done:** Finishing a task on [Tasks](/tasks) or the dashboard gets a quick check and a splash.
- **Good news, out loud:** When nothing needs attention, the [dashboard](/) celebrates: ammonia and nitrite at 0 for a run of tests, the tank's 100th day and birthdays, a pet's anniversary with you, and round numbers of water tests.
- **A little humour:** Empty pages wink at you, a missing page has a fish that swam off, and being offline means waiting to be back on dry land. The animations stay still when your device is set to reduce motion.

## 1.8.8 · 2026-10-01

- **The water test fits its window:** On a computer, the second column of the water test (Ammonia, Nitrate, KH…) no longer runs past the window's edge when a reading shows its status.
- **Drops to ppm in one tap:** With hardness in ppm, a GH or KH on the water test that looks like a drop count, such as 7, or 80 for 8 drops × 10, offers the ppm it comes to (× 17.9) as a Use 125 ppm button. What you typed stays until you tap it. Change hardness in [Settings › Units](/settings#units).

## 1.8.7 · 2026-09-30

- **Hardness from drop kits:** With hardness in degrees ([Settings › Units](/settings#units)), GH and KH on the water test say "1 drop = 1° on API/JBL/Tetra kits", and readings show to a tenth (8.4 dGH from a ppm reading). With hardness in ppm, a round 80 or 90 gets a gentle "Entering drops?" hint, since a degree is about 17.9 ppm, not 10.

## 1.8.6 · 2026-09-30

- **Move your cover photo into place:** In a tank's [Settings](/tanks/current/settings), drag the cover photo to choose which part of it shows, then Save changes. The dashboard, the Tanks list and the public page show it the same way. Arrow keys move it too.
- **Snooze works on Wednesdays:** On a Wednesday, the Snooze sheet on [Tasks](/tasks) didn't open, because In 3 days and Next weekend were the same Saturday. Next weekend is now the one after it on those days.
- **Google's own logo:** The Sign in with Google button on the sign-in page shows Google's four-color G instead of a plain letter in a circle.

## 1.8.5 · 2026-09-28

- **Server settings, easier to find your way:** [Server settings](/settings/server) now goes in the order you set a server up: sign-in, email, public pages, features, then logs and the version. On a computer its parts are listed in the Settings menu, and on a phone at the top of the page.
- **A link to every section:** Each heading in [Settings](/settings) and Server settings has its own link (#), so a shared address like [Server settings › Species photos](/settings/server#species-photos) opens right at it. Tapping # copies the link.
- **Sign out from your photo:** Sign out is no longer at the bottom of the Settings menu on a computer. It's in the menu under your photo, as it was already.

## 1.8.4 · 2026-09-28

- **Cultivars get their own photo:** A plant like Java fern 'Trident' on the [Plants tab](/tanks/current/plants) shows a photo of that cultivar from Wikimedia Commons, or none until you add your own, instead of the plain Java fern's.
- **Which version you have:** [What's new](/settings/changelog) starts with the version installed on this server and when it came out, and marks its release ✓ Installed.

## 1.8.3 · 2026-09-28

- **Species photos now come in:** In 1.8.2 no plant or animal got its species photo, because of a change in how Wikipedia links its photos. Open the [Plants tab](/tanks/current/plants) or the [Livestock tab](/tanks/current/livestock) and they arrive within a minute.
- **When species photos don't come:** [Server settings](/settings/server) now says how many species photos were found and, when this server couldn't reach Wikipedia, why. Look again now tries straight away, and the reason goes in the Logs too.
- **Google sign-in keeps your tanks:** When the admin first signs in with their Google account, it opens the same account as the local admin login, with all its tanks, instead of a new empty one. If 1.8.2 already made a second account, the next sign-in joins the two. After you save Google sign-in in [Server settings](/settings/server), it tells you to enter your own Google account as the admin's, so Google doesn't turn you away.
- **In range, closer together:** On the [dashboard](/), each reading's value sits right beside its name, instead of across a wide gap next to the next reading.

## 1.8.2 · 2026-09-28

- **Photos of your plants and livestock:** Each plant on the [Plants tab](/tanks/current/plants) and each species on the [Livestock tab](/tanks/current/livestock) now shows a photo: a photo of its species from Wikimedia Commons, with its credit, until you add your own. Add yours from the plant's card, or open one in [Photos](/photos) and choose Use as the photo for. An admin can turn species photos off in [Server settings](/settings/server).
- **In range, easier to see:** On the [dashboard](/), the readings that are fine sit in a card like Needs attention, each with its ✓ and its unit, instead of fading into the page.

## 1.8.1 · 2026-09-28

- **Add several at once:** Stocking a tank? On the tank's [Livestock](/tanks/current/livestock/several) or [Plants](/tanks/current/plants/several) tab, choose Add several, search the species list and tick everything that's going in, with a count for each fish and invert, or where each plant goes, then add them all in one go. Undo takes the whole lot back.
- **Import spending:** Bring in past purchases from a spreadsheet (date, what, amount, category and a note) on the tank's [Spending tab](/tanks/current/spending) with Import from a spreadsheet, with a template and a preview first. Undo takes the import back.
- **Fix an import's words on the page:** When a spreadsheet uses a word Waterline doesn't know, like "New" or "Struggling" for a plant's status, the preview lists each one with how many rows have it. Choose what it means and every row with it is fixed, with no need to change the file and start again. For livestock, plants and spending, from [Livestock](/tanks/current/livestock), [Plants](/tanks/current/plants) or [Spending](/tanks/current/spending).
- **Floating plants:** Water lettuce, frogbit and other plants on the surface can be Floating, with their own group at the top of the tank's [Plants tab](/tanks/current/plants). Spreadsheets can say Floating too.
- **Import, in the same place:** Import from a spreadsheet is below the list on every tab, and below the empty box when there's nothing yet.

## 1.8.0 · 2026-09-28

- **Dosing and feeding routines:** Save what you dose and feed, how much and when, like "Thrive S, 1 pump, Mon, Wed, Fri" or "Micro pellets, 2 pinches, every day". They're on the tank's [Overview](/tanks/current) under Routines, and in [Tasks](/tasks) and the dashboard's Due list; tap Done and the dose or feeding is logged in [History](/history), with Undo if you tapped too soon. Routines remind you on the day, not days ahead.
- **Tank settings from the dashboard:** A gear button at the top of the [dashboard](/) opens the tank's [settings](/tanks/current/settings), for its name, volume, photo and more.
- **Exact tank sizes:** A 2.5 gallon tank now shows as 2.5 gal on the dashboard, in Tanks and everywhere else, instead of being rounded to 3.
- **Tasks on set days:** Any task can repeat on chosen days of the week, like every Sunday, with On days when you [add a task](/tasks/new).

## 1.7.0 · 2026-09-28

- **Push notifications:** Get task reminders, overdue alerts and out-of-range alerts on your phone or computer, even with Waterline closed, with Mark done and Snooze right on the notification. Turn it on for each device in [Settings › Notifications](/settings#push), or use the [ntfy](https://ntfy.sh) app instead. Each kind of notice has its own Email and Push switches, so you can have alerts pushed and the digest by email. On iPhone, add Waterline to your Home Screen first.

## 1.6.1 · 2026-09-28

- **What's new links to each feature:** Each line in [Settings › What's new](/settings/changelog), and on the dashboard after an update, now says where the feature lives and links straight to it. A link to a tank's page opens it for the tank you're on.
- **Nothing missed after skipping updates:** If you update past a few versions at once, the dashboard's What's new card covers everything since you last looked, not just the newest release.
- **What's new, easier to scan:** [Settings › What's new](/settings/changelog) shows the newest releases in full and folds older ones away by version; tap one to read it. An admin several versions behind sees the newest three in the update note, with the rest on GitHub.

## 1.6.0 · 2026-09-28

- **A fresh dashboard:** Your tank's photo now runs across the top of the [dashboard](/), with its name on it, and the first thing you see is what needs attention: readings out of range or near a limit, each with a small line of recent readings against its target, and the water change once it's due. Everything that's fine sits below in a compact list; tap any reading for its chart. To change the photo, open one in [Photos](/photos) and choose Set as cover.

## 1.5.0 · 2026-09-28

- **Tasks in your calendar:** See your tasks in Google Calendar, Apple Calendar or Outlook, each on the day it's due, with overdue ones on today. Make a private link in [Settings › Calendar](/settings#calendar), for all your tanks or just one, and add it to your calendar app; it keeps itself up to date.

## 1.4.4 · 2026-09-28

- **Quick add, tidier:** In Quick add (the + button), the other kinds of entry and importing are one grid of matching tiles, each with its icon, and the time shows beside the tank, so you can see when an entry will be logged.

## 1.4.3 · 2026-09-27

- **Steps for each assistant:** [Settings › AI assistant](/settings/assistant) has step-by-step instructions for claude.ai (and Claude Desktop and mobile), ChatGPT, Claude Code and other apps, with the address to copy.

## 1.4.2 · 2026-09-27

- **Connect claude.ai or ChatGPT by signing in:** Add Waterline as a custom connector with your server's address; you'll sign in to Waterline and pick the tanks it can read, with nothing to copy. It then shows in [Settings › AI assistant](/settings/assistant), where you can disconnect it at any time.

## 1.4.1 · 2026-09-27

- **Chart markers, easier to tap:** On [Charts](/charts) and the dashboard, the water change and dose markers are easier to tap, always open the one you meant, and work with the keyboard and screen readers.

## 1.4.0 · 2026-09-27

- **Connect an AI assistant:** Ask Claude, ChatGPT or another assistant about your tanks. It can read the readings, History, livestock and photos of the tanks you choose, and can't change anything. Set it up in [Settings › AI assistant](/settings/assistant); Waterline stores no AI keys.
- **Spending:** See what each tank costs: this month, this year and all time, by category, and month by month. Open the tank's [Spending tab](/tanks/current/spending) and choose Add expense. Buying a saved product again? Log it in one step from [Settings › Products](/settings/products). Your currency is in [Settings › Units](/settings#units).
- **Receipts:** Attach a photo or PDF receipt when you [add an expense](/tanks/current/spending/new). Receipts are part of your [backup](/settings/export).
- **More trends:** The [dashboard](/) points out what keeps happening, like "KH drifts down about 1 dKH a week between water changes" or "pH dips about 0.2 after dosing Excel", and only when it happens most times. The daily or weekly digest email lists them under Worth a look ([Settings › Notifications](/settings#notifications)).
- **Compare tanks:** Under the chart in [Charts](/charts), see the same parameter in your other tanks over the same dates.
- **Notes on the tank's page:** The tank's [Overview](/tanks/current) shows its pinned note and the latest notes, with Add note right there.
- **Remind me:** A one-off reminder about a tank in two taps (tomorrow, in 3 days, next week, in 2 weeks, or a date), from the dashboard's Due list or [the tank's page](/tanks/current/remind).
- **Custom parameters, again:** Adding a custom parameter in the tank's [Targets](/tanks/current/targets) offers the ones you made for your other tanks, with their unit and targets.
- **Where it came from, editable:** An animal's page on the [Livestock tab](/tanks/current/livestock) has its Source (the store or breeder), to fix or fill in later.

## 1.3.0 · 2026-09-27

- **Pet names and photos:** Give any animal a name on the [Livestock tab](/tanks/current/livestock). Naming one of a group gives it its own entry ("Pepper · Corydoras") and a page for its profile photo, notes, history and every photo it's in. Tag pets in any photo in [Photos](/photos) under In this photo. Public pages show the species only, and hide photos with pets in them, unless you turn on Pet names and photos in the tank's [Public page](/tanks/current/public) settings.
- **Importing, easier:** When a spreadsheet's columns have other names, pick which is which on the preview instead of renaming them. One file can also hold several kinds of entry, with a Type column saying what each row is. Start from [History](/history) or [Settings › Import & export](/settings/export); every import can be undone in one step.
- **Your own profile photo:** Add one from your camera or photos in [Settings › Profile](/settings#profile), with a preview before it's saved. Signing in with Google doesn't replace it; Use my Google photo switches back, and Remove photo shows your initials.

## 1.2.0 · 2026-09-27

- **Works behind more proxies:** Signing in no longer ends in *502 Bad Gateway* when Waterline runs behind nginx, such as Nginx Proxy Manager, with its default settings.
- **Account menu:** Tap your profile photo or initials in the top corner for [Settings](/settings), What's new and signing out.
- **Logs for troubleshooting:** [Settings › Server settings › Logs](/settings/server/logs) shows what went wrong, like emails that didn't send, imports that couldn't be read and sign-in problems. A page that fails shows a reference to look up there, and you can download the log to share.
- **Easier-to-read charts:** [Charts](/charts) show the parameter and its unit up the side and dates along the bottom. Hover or tap the line, or use the arrow keys, to see a reading's value, status, date and time.

## 1.1.0 · 2026-09-27

- **Import History from a spreadsheet:** Bring in past water tests, water changes, doses, maintenance, observations and notes, with a template for each and a preview before anything is added. Start from [History](/history), Quick add or [Settings › Import & export](/settings/export); any import can be undone in one step.
- **Import livestock, plants and equipment:** From a spreadsheet, on the tank's [Livestock](/tanks/current/livestock), Plants and Equipment tabs.
- **Latest readings in one row:** On a computer, the [dashboard](/) shows every reading in one row, each with a small line of its recent readings. Hover a short name like NH₃ to see the full name.
- **Spotting trends:** A note under the [dashboard](/)'s chart when a reading has risen or fallen in each of your last tests, or is on course to pass its target.
- **Faster water tests:** On a [water test](/entries/test/new), Use last readings fills in your previous test, Also log a water change saves both at once, and you can add a parameter without leaving the test.
- **Quicker backdating:** The date and time picker offers 1 hour ago, This morning and Yesterday evening.
- **Saved product links:** Keep links to what you buy again in [Settings › Products](/settings/products): one tap to reorder, and a Reorder link when you dose one.
- **Tips:** An ⓘ beside each parameter, and beside a few less obvious fields, explains what it is.
- **Summary for an AI assistant:** A tank's readings, care log and stocking as text to paste into a chat, from the tank's [summary](/tanks/current/summary) or [Settings › Import & export](/settings/export).
- **Easier to set up:** A new server needs only its address. The first page asks for a setup code from the server's log; Google sign-in, who can sign in, the admin's login and a few switches are in [Settings › Server settings](/settings/server).
- **What's new:** This list, in [Settings › What's new](/settings/changelog), and a note on the dashboard after each update.
- **Smaller things:** A log entry you leave unsaved is kept for when you come back; species search finds the names people use; saving works with ad blockers turned on; new category icons, with one for plants; and now and then a small fish swims through the logo.

## 1.0.0 · 2026-09-26

- **First release:** Log water tests at the tank and see each parameter against its target at a glance on the [dashboard](/).
- **Tanks:** Each with its own parameters and targets, set up for freshwater, planted, brackish or reef, in [Tanks](/tanks).
- **History, charts and photos:** Everything logged, in [History](/history), [Charts](/charts) and [Photos](/photos): tests, water changes, dosing, maintenance, livestock, equipment, observations and notes.
- **Tasks and reminders:** Water changes and upkeep in [Tasks](/tasks), with email one at a time or in a daily or weekly digest, and alerts when a reading is out of range ([Settings › Notifications](/settings#notifications)).
- **Livestock, plants and equipment:** For each tank, on its [Livestock](/tanks/current/livestock), Plants and Equipment tabs, with a built-in species list.
- **A public page:** Share a tank from its [Public page](/tanks/current/public) settings, and share single photos from [Photos](/photos).
- **Your data and the app:** A full backup or a CSV of water tests in [Settings › Import & export](/settings/export), and an app for your home screen that logs offline and syncs later.
