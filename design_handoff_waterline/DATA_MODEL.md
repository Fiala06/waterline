# Waterline — data model (SQLite)

The tables as built. The source of truth is `src/lib/server/db/schema.ts`, with its migrations in `drizzle/`; keep this file in step when a migration adds a table or column.

All measurements are stored metric (L, °C, cm, hardness in dGH); timestamps are UTC ISO strings, shown in the user's time zone. Dates without a time (due dates, expense dates) are `YYYY-MM-DD` in the user's time zone. `?` marks a column that can be null.

```
── People ─────────────────────────────────────────────────────────────────────
users            id, google_sub?, email, display_name, is_admin,
                 unit_system(imperial|metric), hardness_unit(dgh|ppm), time_zone,
                 theme(system|dark|light), currency (ISO 4217), setup_done,
                 seen_version (last What's new dismissed), alerts_seen JSON (alert keys marked
                 read, the same on every device),
                 avatar_choice(google|own|none), avatar_at?, own_avatar_at?,
                 last_seen_at? (to the quarter hour), sessions_revoked_at? (Sign out everywhere:
                 sessions from before are no longer good), created_at
invites          id, email, token_hash, invited_by?, created_at, expires_at (7 days),
                 accepted_at?, accepted_user_id?, revoked_at? (an invitation to the server;
                 accepted by signing in with Google as that address; revoking locks it out)
notification_prefs user_id, task_reminders, overdue_alerts, out_of_range_alerts,
                 delivery(individual|daily|weekly), lead_days, send_time,
                 notify_email?, unsubscribed_at? (those three switches are email's);
                 push_task_reminders, push_overdue_alerts, push_out_of_range_alerts,
                 ntfy_url? (an ntfy topic's address), ntfy_token_enc?
push_subscriptions id, user_id, endpoint (unique), p256dh, auth, label ("Chrome on Android"),
                 created_at, last_sent_at? (a device that gets Web Push)

── Tanks and what's logged ────────────────────────────────────────────────────
tanks            id, user_id, name, type(freshwater|planted|brackish|reef),
                 nominal_volume_l?, actual_volume_l?, length_cm?, width_cm?, height_cm?,
                 glass_thickness_cm?, substrate_depth_cm?, rim_gap_cm? (the Tank volume
                 calculator's other measurements, kept for next time),
                 start_date?, notes?, cover_photo_id?, cover_x, cover_y (the cover's focus, 0–100,
                 50 50 the middle), spec_brand?, spec_model?, glass?,
                 substrate?, water_source?, photoperiod_h? (the hours between lights_on and
                 lights_off when both are set), lights_on?, lights_off?, co2_on?, co2_off?
                 ("HH:MM": the lighting and CO₂ schedule), cycling (still cycling: ammonia and
                 nitrite above target show as ▲ Cycling, the dashboard follows the cycle, and
                 Mark as running clears it with a "Cycle complete" note), without_equipment JSON
                 (what it goes without on purpose, of filter|heater|light|co2: ["heater"]; adding
                 one takes it off), review_checks JSON
                 remind_to(all|owner), alert_to(all|owner) (a shared tank: whom its reminders and
                 out-of-range alerts go to),
                 (the setup review: when each part was last checked, {details, equipment,
                 targets, livestock}), archived_at?, created_at
tank_parameters  id, tank_id, key (ph|nh3|no2|no3|gh|kh|temp|… or custom), name, unit,
                 decimals, min?, max?, test_every_days? (Test every: a reading older than this
                 is due on the dashboard), tracked, sort, is_custom

tests            id, tank_id, taken_at, note?, edited_at?, client_id? (offline dedupe),
                 import_id?, logged_by? (who logged it on a shared tank)
test_readings    test_id, parameter_id, value, prev_value? (before the last edit: "was 40")

events           id, tank_id, category(water_change|dosing|maintenance|livestock|
                 equipment|observation|note|feeding), occurred_at, note?, data JSON, edited_at?,
                 client_id?, import_id?, logged_by? (who logged it on a shared tank)
                 -- data examples:
                 -- water_change {percent, volume_l, source: tap|rodi|mix}
                 -- dosing {product, amount, unit, task_id? (logged by a routine's Done)}
                 -- feeding {food, amount?, unit?, task_id?}
                 -- maintenance {actions:[...], equipment_id?}
                 -- livestock {action: added|removed|moved|status|named, livestock_id, delta,
                 --            reason: loss|rehomed|recount}
                 -- equipment {action: installed|replaced|adjusted|removed, equipment_id,
                 --            changes:{field:[old,new]}}
                 -- equipment {action: without|without_off, type, item} ("No heater in this tank")
                 -- equipment {action: schedule, equipment_id, item, schedule, was} (its periods changed)
                 -- equipment {action: par, par_id, item: "PAR", spot, value} (a PAR reading)
                 -- observation {tags:[...], recheck_at?}
                 -- note {system: tank_created|tank_archived|tank_restored} (the tank's own)
                 -- note {system: setup_reviewed, changed:[parts], prev_checks} (All still
                 --       right on the setup review; prev_checks lets Undo put the checks back)
photos           id, tank_id, event_id?, test_id?, path, thumb_path, width, height, taken_at
                 (from the photo's details, the day picked on upload, or its entry's date),
                 taken_at_set (the keeper changed it in the viewer: it no longer follows the entry),
                 in_timeline (off: left out of the tank's timeline, e.g. a close-up)
photo_livestock  photo_id, livestock_id (pets tagged in a photo)

── Tasks ──────────────────────────────────────────────────────────────────────
tasks            id, tank_id, name, kind(water_change|test|maintenance|other|dosing|feeding|
                 review: the setup review, one per tank, every 30/91/182 days or none when off;
                 done on its page, not by Mark done),
                 recurring, interval_days?, schedule_mode(completion|fixed|weekdays),
                 weekdays? ("1,3,5", 0 = Sunday), next_due?, ends_on? (no occurrences after
                 this day), snoozed_until?, equipment_id? (the item's service reminder: the
                 equipment form sets its cadence, and a logged service completes it),
                 open_form_on_done, product?, amount?, amount_unit? (a dosing or feeding
                 routine: Done logs the dose or feeding, and Undo removes it), created_at
task_completions id, task_id, completed_at, event_id?,
                 prev_next_due?, prev_snoozed_until? (to undo),
                 skipped (Skip this one: passed over, not done; event_id is its
                 "Skipped" note in History, removed again by Undo)

── What's in the tank, and what it costs ──────────────────────────────────────
equipment        id, tank_id, type(filter|heater|light|co2|pump|skimmer|other), brand?,
                 model?, specs JSON, schedule? JSON ({periods:[{on,off}], rampMin?}: when it
                 runs; null runs all day; a light's sets the tank's lights times and photoperiod),
                 installed_at?, last_serviced_at?, notes?, removed_at?, import_id?, created_at
par_readings     id, tank_id, spot, x, y (0–100 across and front to back), value (µmol/m²/s),
                 note?, measured_at, created_at
livestock        id, tank_id, kind(fish|invert|coral), common_name, scientific_name?,
                 count, status(in_tank|quarantine), added_at?, source?, removed_at?,
                 nickname? (a pet: one animal, its own entry), notes?, photo_id?,
                 import_id?, created_at
plants           id, tank_id, name, scientific_name?, position(background|midground|
                 foreground|epiphyte|floating), status(thriving|melting|algae|other),
                 last_trimmed_at?, removed_at?, import_id?, photo_id? (the keeper's own), created_at
test_kits        id, user_id, name, param_key (ph|nh3|no2|no3|gh|kh|temp or custom:<name>),
                 steps JSON [{text, seconds?}] (a test's steps, timed ones run on the form),
                 created_at
products         id, user_id, name, url, note?, strength_mg_per_ml?, strength_of? (its strength for
                 the Dose → ppm calculator: mg per mL of what it adds), created_at (saved reorder links)
expenses         id, tank_id, date, amount_cents, category(livestock|plants|equipment|
                 consumables|other), what, note?, product_id?, receipt_path?,
                 receipt_type?(image/jpeg|application/pdf), import_id?, created_at

── Sharing ────────────────────────────────────────────────────────────────────
public_pages     tank_id, enabled, slug, show_readings, show_charts, show_photos,
                 show_activity, show_livestock, show_equipment, show_description,
                 show_timeline (photos in date order with the day, readings and changes between,
                 following the readings, pet names, livestock and activity switches),
                 show_pet_names, description?, display_name, indexable, seo_title?,
                 seo_description?, og_photo_id?, og_plain, view_count
public_page_views tank_id, day, views
tank_members     id, tank_id, email, user_id? (once accepted), role(log|view), token_hash,
                 invited_by?, created_at, expires_at (7 days), accepted_at?, revoked_at?
                 (people a tank is shared with: "log" logs tests, water changes, dosing, notes,
                 photos and tasks done; "view" is read-only; only the owner changes setup;
                 one active row (accepted, not revoked) per tank and user_id, unique; removed
                 and expired rows stay as history)
photo_shares     id (slug), photo_id, include_note, include_tank, created_at, revoked_at?

── Data in and out ────────────────────────────────────────────────────────────
imports          id, user_id, tank_id, kind(livestock|plants|equipment|tests|
                 water_changes|dosing|maintenance|observations|notes|history|expenses),
                 file_name?, summary, created_at, undone_at?
exports          id, user_id, scope(tank|account), tank_id?, format(zip|csv), status,
                 progress, progress_text?, file_path?, file_name?, size?, summary?,
                 error?, created_at, expires_at?
assistant_tokens id, user_id, name, token_hash (SHA-256), hint (last 4), kind(assistant|sensor:
                 may only add readings), tank_ids JSON,
                 created_at, last_used_at? (read-only access for an AI assistant);
                 connected by signing in: client_id?, expires_at?, refresh_hash?,
                 refresh_expires_at?, prev_refresh_hash? (the refresh token it replaced:
                 a second use of it is refused as a replay and logged)
oauth_clients    id (client_id), name, redirect_uris JSON, secret_hash?, created_at
                 (apps that registered to connect by signing in)
calendar_feeds   token (the secret in /cal/<token>.ics), user_id (one each), created_at,
                 last_fetched_at?
oauth_codes      code_hash, client_id, user_id, redirect_uri, code_challenge (PKCE S256),
                 tank_ids JSON, expires_at, used_at? (one-time, 10 minutes)

── Server ─────────────────────────────────────────────────────────────────────
server_settings  singleton: email_provider?(mailgun|smtp), mailgun_api_key_enc?,
                 mailgun_domain?, mailgun_region(us|eu), smtp_host?, smtp_port?,
                 smtp_secure, smtp_user?, smtp_password_enc?, sender?,
                 google_client_id?, google_client_secret_enc?, admin_email?,
                 signup_mode?(admin|list|invited|open), allowed_emails?,
                 local_admin_username?, local_admin_password_hash?,
                 allow_public_pages, public_home_enabled, public_base_url?, ga4_id?,
                 consent_banner, search_console_tag?, scheduled_emails, update_check,
                 log_level(warn|info), log_debug_until?, stock_photos, species_care (care ranges
                 from FishBase, downloaded by the server into DATA_DIR/species-care.json), vapid_public_key?,
                 vapid_private_key_enc? (Web Push keys, made on first use)
stock_photos     name (the scientific name looked up), status(ok|none|failed), file?,
                 width?, height?, author?, license?, license_url?, page_url?, reason?,
                 fetched_at (species photos from Wikimedia Commons, kept in DATA_DIR/stock)
sensor_readings  id, tank_id, parameter_id, value (stored units), at, source (the token's name),
                 token_id? (readings from probes and controllers, apart from tests: one a minute
                 per parameter, kept a year, never an alert by themselves; charts show each span's
                 average with its lowest and highest)
sensor_hours     tank_id, parameter_id, hour ('YYYY-MM-DDTHH', UTC), n, total, lo, hi
                 (each hour of sensor samples in sum, primary key tank+parameter+hour; kept by
                 triggers on sensor_readings: a sample adds to its hour, a deleted one takes away,
                 and the hour goes with its last sample; lo/hi stay until then. Charts with spans
                 of an hour or more read these instead of the samples)
wishes           id, tank_id, kind(fish|invert|coral|plant|equipment), name, scientific_name?,
                 count, equipment_type?, note?, price_cents?, url?, created_at, added_at?
                 (the wish list; Add to tank writes the livestock, plant or equipment row,
                 its event and, when asked, the expense, then sets added_at)
action_tokens    token_hash, task_id, action(done|snooze), due, expires_at, used_at?
email_log        id, user_id, key, created_at, error? (so nothing is sent twice; pushes
                 are "push:<key>")
logs             id, created_at, level(error|warn|info|debug), area, message, details?,
                 user_id?, ref?
```

Everything that belongs to a tank is deleted with it, and everything that belongs to a user with them. `import_id` ties rows to the import that added them, so an import is undone in one step.

Indexes: `tests(tank_id, taken_at)`, `test_readings(parameter_id)`, `sensor_readings(tank_id, parameter_id, at)`, `events(tank_id, occurred_at)`, `tasks(next_due)`, `expenses(tank_id, date)`, `public_pages(slug)`, `assistant_tokens(token_hash)`, `assistant_tokens(refresh_hash)`, plus one per `tank_id` or `user_id` foreign key.
