# Waterline — data model (SQLite)

All measurements stored metric; timestamps UTC ISO; user time zone applied on display.

```
users            id, google_sub?, email, display_name, is_admin, local_password_hash?,
                 unit_system(imperial|metric), hardness_unit(dgh|ppm), time_zone, theme,
                 created_at
notification_prefs user_id, task_reminders, overdue_alerts, out_of_range_alerts,
                 delivery(individual|daily|weekly), lead_days, send_time, notify_email

tanks            id, user_id, name, type(freshwater|planted|brackish|reef), nominal_volume_l,
                 actual_volume_l, length_cm, width_cm, height_cm, start_date, notes,
                 cover_photo_id?, spec_brand, spec_model, glass, substrate, water_source,
                 photoperiod_h, archived_at?
tank_parameters  id, tank_id, key (ph|nh3|no2|no3|gh|kh|temp|custom), name, unit,
                 decimals, min, max, tracked, sort, is_custom

tests            id, tank_id, taken_at, note, edited_at?, client_id (offline dedupe)
test_readings    test_id, parameter_id, value

events           id, tank_id, category(water_change|dosing|maintenance|livestock|
                 equipment|observation|note), occurred_at, note, data JSON, edited_at?,
                 client_id
                 -- data examples:
                 -- water_change {percent, volume_l, source: tap|rodi|mix}
                 -- dosing {product, amount, unit}
                 -- maintenance {actions:[...], equipment_id?}
                 -- livestock {action: added|removed|moved, livestock_id, delta, reason: loss|rehomed|recount}
                 -- equipment {action: installed|replaced|adjusted|removed, equipment_id, changes:{field:[old,new]}}
                 -- observation {tags:[...], recheck_at?}
photos           id, tank_id, event_id?, test_id?, path, thumb_path, width, height, taken_at
photo_shares     id (slug), photo_id, include_note, include_tank, created_at, revoked_at?

tasks            id, tank_id, name, kind(water_change|test|maintenance|other), recurring,
                 interval_days, schedule_mode(completion|fixed), next_due, snoozed_until?,
                 equipment_id?, open_form_on_done, created_at
task_completions id, task_id, completed_at, event_id?

equipment        id, tank_id, type(filter|heater|light|co2|pump|skimmer|other), brand, model,
                 specs JSON, installed_at, last_serviced_at?, notes, removed_at?
livestock        id, tank_id, kind(fish|invert|coral), common_name, scientific_name?,
                 count, status(in_tank|quarantine), added_at, source?, removed_at?
plants           id, tank_id, name, scientific_name?, position(background|midground|
                 foreground|epiphyte), status(thriving|melting|algae|other), last_trimmed_at?

public_pages     tank_id, enabled, slug, show_readings, show_charts, show_photos,
                 show_activity, show_livestock, show_equipment, show_description,
                 description, display_name, indexable, seo_title, seo_description,
                 og_photo_id?, og_version, view_count
server_settings  singleton: email_provider(mailgun|smtp), mailgun_api_key_enc,
                 mailgun_domain, mailgun_region(us|eu), smtp_host, smtp_port, smtp_secure,
                 smtp_user, smtp_password_enc, sender, allow_public_pages,
                 public_home_enabled, public_base_url, ga4_id?, consent_banner,
                 search_console_tag?, local_admin_enabled
action_tokens    token_hash, task_id, action(done|snooze), expires_at, used_at?
exports          id, user_id, scope(tank|account), tank_id?, format(zip|csv), status,
                 progress, file_path?, expires_at
```

Indexes: `tests(tank_id, taken_at)`, `events(tank_id, occurred_at)`, `tasks(next_due)`, `public_pages(slug)`.
