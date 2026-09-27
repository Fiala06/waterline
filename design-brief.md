# Waterline

**Design brief for site layout and UI**

*Version 1 scope. Kept for history: the design answered it (`design_handoff_waterline/`), and the app built from that is described in the [README](README.md).*

## 1. Project overview

A self-hosted web app for aquarium keepers to track their tanks: water test results, water changes, maintenance, dosing, livestock and plant changes, and photos. It replaces a hand-written log with structured records, trend charts, and email reminders for upcoming maintenance.

Each person who runs the app hosts it on their own server. Users sign in with Google and see only their own tanks.

## 2. Who uses it and where

- **Primary user:** a hobbyist with one to a few tanks, often planted or reef, who tests water regularly and wants to spot trends.
- **Main context:** standing at the tank with a phone, often with wet hands, logging a test result or water change in under 30 seconds.
- **Secondary context:** sitting at a desk or couch reviewing charts, history, and photos on a larger screen.

## 3. Design principles

- **Mobile first:** design every screen for phone width first, then expand for tablet and desktop.
- **One-handed logging:** primary actions reachable by thumb near the bottom of the screen, large tap targets, minimal typing, numeric keypad for readings.
- **Glanceable status:** the dashboard should answer "is anything wrong, and what is due?" in one look.
- **Forgiving input:** every field in a water test is optional; people rarely test everything every time.
- **Installable:** the site will work as a PWA (added to the home screen), so it should feel app-like, including an app icon and splash state.
- **Accessible:** status colors must never be the only signal; pair them with icons or labels. Meet WCAG AA contrast.
- **Light and dark themes:** tanks are often viewed in dim rooms at night, so dark mode is part of v1.

## 4. Navigation structure

Suggested structure. The designer is welcome to propose alternatives.

- **Phone:** bottom tab bar with Dashboard, Tanks, Tasks, and Settings, plus a prominent floating "+" quick-add button.
- **Desktop:** left sidebar with the same sections; quick-add stays visible in the header.
- **Tank switcher:** users with multiple tanks need a fast way to switch the active tank from the dashboard and quick-add sheet.

## 5. Screen inventory

### 5.1 Sign-in

**Purpose:** Entry point for all users.

- App name/logo and a single "Sign in with Google" button.
- **Open question:** a possible local admin login as a fallback (see section 9).

### 5.2 First-login setup

**Purpose:** Short onboarding shown once after the first Google sign-in.

- Display name (prefilled from Google).
- **Unit system:** imperial or metric. Controls volume (gal/L), temperature (°F/°C), and dimensions (in/cm).
- **Water hardness units:** dGH or ppm (separate choice, since it does not follow imperial/metric).
- Time zone (auto-detected, editable).
- Prompt to create the first tank, with the option to skip.

### 5.3 Dashboard (per tank)

**Purpose:** The home screen. Shows current status and what needs attention.

- Tank switcher at the top, with the tank name and a small photo.
- **Parameter status cards:** latest reading per parameter, colored green/yellow/red against the target range, with the date of the reading.
- "Days since last water change" indicator.
- Upcoming and overdue tasks, each with a "Mark done" action.
- **Trend chart section:** one small chart per parameter (or a selectable chart) with events marked on the timeline, e.g. a water change marker where nitrate drops.
- **Recent activity feed:** the last several events with photo thumbnails.
- Empty state for a new tank with no data, guiding the user to log a first test.

### 5.4 Quick-add sheet

**Purpose:** The most-used interaction. Opens from the "+" button anywhere in the app.

- **Three large choices:** Log water test, Log water change, Add note/photo. A "More" option opens the other event types.
- Defaults to the current tank and the current date/time, both changeable.
- Designed as a bottom sheet on phone and a modal on desktop.

### 5.5 Log water test form

**Purpose:** Enter one set of readings.

- **A list of the tank's parameters (defaults:** pH, ammonia, nitrite, nitrate, GH, KH, temperature, plus any custom ones), each with a numeric input and its unit.
- All fields optional. Show the previous reading faintly next to each field for reference.
- Inline out-of-range indicator as values are entered.
- Optional note (e.g. "before water change") and optional photo.

### 5.6 Log event form

**Purpose:** One form layout that adapts to the event category.

- **Categories:** water change, dosing, maintenance, livestock/plant change, equipment change, observation.
- **Shared fields:** date/time, note, photos.
- **Category-specific fields, e.g. water change:** amount (volume or percent) and source water (tap, RODI, mix); dosing: product and amount.

### 5.7 Tanks list

**Purpose:** All of a user's tanks.

- Cards with tank photo, name, type, volume, and a small status summary (any parameters out of range, any tasks overdue).
- "Add tank" action. Archived tanks shown in a separate, collapsed section.

### 5.8 Tank detail and edit

**Purpose:** The tank's profile and settings.

- **Fields:** name, type (freshwater, planted, brackish, reef), nominal volume, actual volume, dimensions, start date, notes, cover photo.
- **Parameter settings:** which parameters this tank tracks, their target ranges, and adding custom parameters (name, unit, range).
- Archive tank action (not delete; history is kept).

### 5.9 History / timeline

**Purpose:** Browse everything that has happened to a tank.

- Reverse-chronological list of tests and events, grouped by date.
- Filter by category and date range.
- Tap any entry to view, edit, or delete it.

### 5.10 Charts

**Purpose:** Full-size trend view for analysis.

- Choose a parameter and a time range (e.g. 2 weeks, 3 months, all time).
- Target range shown as a shaded band.
- Event markers on the timeline; tapping a marker shows the event.
- Works in portrait on phone; expanded layout on desktop.

### 5.11 Photo gallery

**Purpose:** View photos across a tank's history.

- Grid of photos by date, taken from events.
- Full-screen viewer with the date and the related event note.

### 5.12 Tasks

**Purpose:** Maintenance schedules and reminders.

- Sections for Overdue, Due soon, and Later, across all tanks or filtered by tank.
- Each task shows the name, tank, due date, and interval. Actions: Mark done, Snooze, Edit.
- Marking a task done can open the matching log form (e.g. completing "Water change" opens the water change form).
- **Create/edit task form:** name, tank, recurring or one-off, interval (every X days/weeks), next due date, and whether the schedule counts from completion or stays on a fixed calendar.

### 5.13 Settings

**Purpose:** Account and preferences.

- **Profile:** name, email for notifications (defaults to the Google address).
- **Units:** unit system, hardness units, time zone.
- **Notifications:** turn each type on/off (task reminders, overdue alerts, out-of-range alerts), individual vs. daily/weekly digest, reminder lead time, preferred send time.
- Export (see 5.14).
- **Theme:** light, dark, or match system.
- Sign out.

### 5.14 Export

**Purpose:** Let users take all their data with them.

- **Scope:** one tank or the whole account.
- **Formats:** full backup (ZIP of JSON data plus photos) and CSV of water tests.
- Progress state while the export builds, then a download button.

### 5.15 Admin settings (server owner only)

**Purpose:** Setup for the person hosting the app.

- **Email delivery setup:** SMTP host, port, username, password, and sender address, or an email service API key.
- "Send test email" button with a success/failure message.
- Google sign-in configuration status.
- Visible only to the admin account.

## 6. Email templates

Emails should match the app's visual style and read well on phones. Needed templates:

- **Task reminder:** task, tank, due date, with "Mark done" and "Snooze 1 day" buttons that work without signing in.
- **Overdue alert:** same layout, with clear overdue emphasis.
- **Digest (daily or weekly):** all due and overdue tasks grouped by tank, plus any out-of-range readings.
- **Out-of-range alert:** parameter, reading, target range, and a link to the tank dashboard.
- **Test email:** simple confirmation that email delivery works.
- **Every email:** a footer link to notification settings and a one-click unsubscribe.

## 7. Components and states to design

- Parameter status card (in range, near limit, out of range, no data).
- Event card for feeds and history, with category icon and optional thumbnail.
- Task row with due status (due soon, due today, overdue).
- Chart with target band and event markers.
- Numeric input with unit label, sized for thumbs.
- Photo upload control that opens the phone camera or library.
- Category icon set for the event types.
- **Empty states:** no tanks, no readings, no tasks, no photos.
- Loading, success confirmation (e.g. after logging a test), and error states.
- Confirmation dialogs for delete and archive.

## 8. Units and data display

Values are stored in metric and shown in each user's chosen units. Layouts should allow for either unit label on every measurement.

|                                    |                                        |                                        |
|------------------------------------|----------------------------------------|----------------------------------------|
| **Measurement**                    | **Imperial**                           | **Metric**                             |
| Volume                             | gallons (gal)                          | liters (L)                             |
| Temperature                        | °F                                     | °C                                     |
| Dimensions                         | inches (in)                            | centimeters (cm)                       |
| Water hardness                     | dGH / dKH or ppm (separate preference) | dGH / dKH or ppm (separate preference) |
| Chemistry (ammonia, nitrate, etc.) | ppm                                    | ppm                                    |

## 9. Open questions

- **Local admin login:** should there be a non-Google fallback login for the server owner, in case Google sign-in breaks? Affects the sign-in screen.
- **Branding:** logo and color direction are open. An aquatic but not cartoonish look is preferred.

## 10. Out of scope for v1

Planned for later. The layout should leave room for these without redesigning the navigation:

- Equipment inventory with attached manuals.
- Dedicated livestock and plant lists with status tracking.
- Dosing schedules and dosing calculators.
- Side-by-side photo comparison between dates.
- Shared tanks and multiple users per tank.
- Push notifications and webhooks (e.g. Discord, ntfy) alongside email.
- Data import.

## 11. Requested deliverables

- Phone and desktop layouts for every screen in section 5.
- Light and dark theme versions.
- Component library covering section 7.
- Email templates from section 6.
- **A clickable prototype of the core flow:** sign in, set up, create a tank, log a water test, view the dashboard, complete a task.
