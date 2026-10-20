// Equipment types and their type-specific fields (T3: "Fields adapt to type:
// heaters get wattage, lights get photoperiod"). Stored metric in `specs`.
import {
  formatNumber,
  toDisplay,
  toStored,
  unitLabel,
  type UnitPrefs,
} from "./units";
import { isTime } from "./time";

export type EquipmentType =
  | "filter"
  | "heater"
  | "light"
  | "co2"
  | "pump"
  | "skimmer"
  | "doser"
  | "other";

export const EQUIPMENT_TYPE_LABEL: Record<EquipmentType, string> = {
  filter: "Filter",
  heater: "Heater",
  light: "Light",
  co2: "CO₂",
  pump: "Pump",
  skimmer: "Skimmer",
  doser: "Doser",
  other: "Other",
};
/** What a tank can be marked as going without ("No heater"), so a missing heater reads as a choice, not a gap. */
export const WITHOUT_TYPES = ["filter", "heater", "light", "co2"] as const;
export type WithoutType = (typeof WITHOUT_TYPES)[number];
export const isWithoutType = (v: unknown): v is WithoutType =>
  WITHOUT_TYPES.includes(v as WithoutType);
/** "No heater", "No CO₂" */
export const withoutLabel = (t: WithoutType) =>
  `No ${t === "co2" ? "CO₂" : EQUIPMENT_TYPE_LABEL[t].toLowerCase()}`;

export const EQUIPMENT_TYPES = Object.keys(
  EQUIPMENT_TYPE_LABEL,
) as EquipmentType[];

type Quantity = "flow" | "temp" | "volume" | "none";
export interface SpecField {
  key: string;
  label: string;
  kind: "number" | "text" | "select";
  quantity?: Quantity;
  unit?: string; // fixed unit when quantity is none
  options?: string[];
  placeholder?: string;
}

export const SPEC_FIELDS: Record<EquipmentType, SpecField[]> = {
  filter: [
    {
      key: "filterType",
      label: "Filter type",
      kind: "select",
      options: [
        "Canister",
        "Hang-on-back",
        "Sponge",
        "Internal",
        "Sump",
        "Undergravel",
      ],
    },
    { key: "flowLh", label: "Flow rate", kind: "number", quantity: "flow" },
    {
      key: "media",
      label: "Media",
      kind: "text",
      placeholder: "Ceramic + sponge",
    },
  ],
  heater: [
    { key: "watts", label: "Wattage", kind: "number", unit: "W" },
    { key: "setC", label: "Set to", kind: "number", quantity: "temp" },
  ],
  light: [
    { key: "photoperiodH", label: "Photoperiod", kind: "number", unit: "h" },
    { key: "intensity", label: "Intensity", kind: "number", unit: "%" },
    {
      key: "spectrum",
      label: "Spectrum",
      kind: "text",
      placeholder: "Full spectrum",
    },
  ],
  co2: [
    { key: "bps", label: "Bubble rate", kind: "number", unit: "bps" },
    { key: "cylinder", label: "Cylinder", kind: "text", placeholder: "5 lb" },
  ],
  pump: [
    { key: "flowLh", label: "Flow rate", kind: "number", quantity: "flow" },
  ],
  skimmer: [
    { key: "ratedL", label: "Rated for", kind: "number", quantity: "volume" },
  ],
  // a doser (#196): what it doses, and when, are its own rows (src/lib/dosers.ts)
  doser: [{ key: "heads", label: "Pump heads", kind: "number", unit: "heads" }],
  other: [],
};

/** Suggested maintenance task when adding equipment (T3): its verb, and the cadence an import uses. */
export const SUGGESTED_TASK: Partial<
  Record<EquipmentType, { verb: string; days: number }>
> = {
  filter: { verb: "Clean", days: 28 },
  skimmer: { verb: "Empty", days: 7 },
  co2: { verb: "Check", days: 30 },
};

const LPH_PER_GPH = 3.785411784;

export function specUnit(f: SpecField, prefs: UnitPrefs): string {
  if (f.quantity === "flow")
    return prefs.unitSystem === "imperial" ? "gph" : "L/h";
  if (f.quantity === "temp") return unitLabel("temp", prefs);
  if (f.quantity === "volume") return unitLabel("volume", prefs);
  return f.unit ?? "";
}

export function specToDisplay(
  f: SpecField,
  stored: number,
  prefs: UnitPrefs,
): number {
  if (f.quantity === "flow")
    return prefs.unitSystem === "imperial" ? stored / LPH_PER_GPH : stored;
  if (f.quantity === "temp") return toDisplay(stored, "temp", prefs);
  if (f.quantity === "volume") return toDisplay(stored, "volume", prefs);
  return stored;
}

export function specToStored(
  f: SpecField,
  display: number,
  prefs: UnitPrefs,
): number {
  if (f.quantity === "flow")
    return prefs.unitSystem === "imperial" ? display * LPH_PER_GPH : display;
  if (f.quantity === "temp") return toStored(display, "temp", prefs);
  if (f.quantity === "volume") return toStored(display, "volume", prefs);
  return display;
}

/** "Tidewell C-400 canister" style name. */
export function equipmentName(e: {
  brand: string | null;
  model: string | null;
  type: EquipmentType;
  specs: Record<string, unknown>;
}) {
  const base =
    [e.brand, e.model].filter(Boolean).join(" ") ||
    EQUIPMENT_TYPE_LABEL[e.type];
  const ft =
    typeof e.specs.filterType === "string"
      ? e.specs.filterType.toLowerCase()
      : "";
  return e.type === "filter" && ft && !base.toLowerCase().includes(ft)
    ? `${base} ${ft}`
    : base;
}

/** One-line spec summary: "1,200 L/h · Ceramic + sponge", "200 W · Set 77 °F", "8 h · 70%". */
export function specSummary(
  type: EquipmentType,
  specs: Record<string, unknown>,
  prefs: UnitPrefs,
): string[] {
  const out: string[] = [];
  for (const f of SPEC_FIELDS[type]) {
    const v = specs[f.key];
    if (v == null || v === "") continue;
    if (f.key === "filterType") continue; // part of the name
    if (typeof v === "number") {
      const shown = specToDisplay(f, v, prefs);
      const n = Number(
        formatNumber(shown, f.quantity === "temp" ? 0 : 1),
      ).toLocaleString("en-US");
      const u = oneOf(n, specUnit(f, prefs));
      out.push(
        f.key === "setC"
          ? `Set ${n} ${u}`
          : f.key === "ratedL"
            ? `Up to ${n} ${u}`
            : u === "%"
              ? `${n}%`
              : `${n} ${u}`,
      );
    } else out.push(String(v));
  }
  return out;
}

/** A spec's value as shown: "60%", "8 h", "25 °C", text as it is, and "none" for nothing. */
export function specValueText(
  f: SpecField,
  v: unknown,
  prefs: UnitPrefs,
): string {
  if (v == null || v === "") return "none";
  if (typeof v === "number") {
    const n = Number(
      formatNumber(specToDisplay(f, v, prefs), f.quantity === "temp" ? 0 : 1),
    ).toLocaleString("en-US");
    const u = oneOf(n, specUnit(f, prefs));
    return u === "%" ? `${n}%` : u ? `${n} ${u}` : n;
  }
  return String(v);
}

/** A unit that is a thing counted ("heads") in the singular for one: "1 head", "4 heads". */
const oneOf = (n: string, u: string) => (n === "1" && u === "heads" ? "head" : u);

const CHANGE_LABELS: Record<string, string> = {
  brand: "Brand",
  model: "Model",
  name: "Name",
  schedule: "Schedule",
};

/**
 * What an adjustment changed, in words: the setting's label and "60% → 80%",
 * from an equipment event's `changes` ({ key: [before, after] }). The field is
 * found by its key across every type; brand and model have labels of their own.
 */
export function specChangeText(
  key: string,
  change: unknown,
  prefs: UnitPrefs,
): { label: string; text: string } | null {
  if (!Array.isArray(change) || change.length !== 2) return null;
  const [before, after] = change;
  const f = Object.values(SPEC_FIELDS)
    .flat()
    .find((x) => x.key === key);
  if (f)
    return {
      label: f.label,
      text: `${specValueText(f, before, prefs)} → ${specValueText(f, after, prefs)}`,
    };
  const plain = (v: unknown) => (v == null || v === "" ? "none" : String(v));
  return {
    label: CHANGE_LABELS[key] ?? key,
    text: `${plain(before)} → ${plain(after)}`,
  };
}

// ── Service cadence ─────────────────────────────────────────────────────────
// "Service every …" on an item is a maintenance task with its equipment_id;
// the equipment form creates, updates or removes it. "Log service" completes it.

export const SERVICE_CADENCES: {
  value: string;
  days: number | null;
  label: string;
}[] = [
  { value: "off", days: null, label: "Off" },
  { value: "14", days: 14, label: "Every 2 weeks" },
  { value: "30", days: 30, label: "Monthly" },
  { value: "90", days: 90, label: "Every 3 months" },
  { value: "180", days: 180, label: "Every 6 months" },
  { value: "custom", days: null, label: "Custom…" },
];

/** The select's value for a task's interval: a preset, or "custom" with the days beside it. */
export function serviceCadenceValue(days: number | null | undefined): string {
  if (!days) return "off";
  return SERVICE_CADENCES.find((c) => c.days === days)?.value ?? "custom";
}

/** The days a form chose: a preset, the custom number (1–730), or null for off. Unknown values are off. */
export function parseServiceCadence(
  value: string,
  customDays: unknown,
): number | null {
  const preset = SERVICE_CADENCES.find((c) => c.value === value);
  if (!preset || value === "off") return null;
  if (value !== "custom") return preset.days;
  const n = Math.round(Number(customDays));
  return Number.isFinite(n) && n >= 1 && n <= 730 ? n : null;
}

/** "Service due in 12 days", "▲ Service due today", "✕ Service overdue 3 days". */
export function serviceDueText(daysUntil: number): {
  text: string;
  level: "ok" | "warn" | "bad";
} {
  if (daysUntil < 0)
    return {
      text: `✕ Service overdue ${-daysUntil} day${daysUntil === -1 ? "" : "s"}`,
      level: "bad",
    };
  if (daysUntil === 0) return { text: "▲ Service due today", level: "warn" };
  return {
    text: `Service due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
    level: "ok",
  };
}

/** The Service reminder a new item starts with: monthly for a filter or CO₂, every 2 weeks for a skimmer, off otherwise. */
export const DEFAULT_SERVICE: Partial<Record<EquipmentType, string>> = {
  filter: "30",
  skimmer: "14",
  co2: "30",
};

/** "Service" for a type without a suggested verb; "Clean" for a filter. */
export const serviceVerb = (type: EquipmentType) =>
  SUGGESTED_TASK[type]?.verb ?? "Service";

// ── Lighting and CO₂ schedule ───────────────────────────────────────────────

/** Hours between two "HH:MM" times, across midnight when off is earlier ("22:00"–"06:00" is 8 h); null unless both are times. */
export function scheduleHours(
  on: string | null | undefined,
  off: string | null | undefined,
): number | null {
  const t = (s: string | null | undefined) => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s ?? "");
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = t(on);
  const b = t(off);
  if (a == null || b == null) return null;
  const mins = (b - a + 24 * 60) % (24 * 60);
  return Math.round((mins / 60) * 100) / 100;
}

/** "8 h", "7.5 h" */
export const hoursText = (h: number) =>
  `${Number.isInteger(h) ? h : h.toFixed(1).replace(/\.0$/, "")} h`;

/** "Lights 08:00–16:00 · CO₂ 07:00–15:00", or "" when neither is set. */
export function scheduleText(t: {
  lightsOn: string | null;
  lightsOff: string | null;
  co2On: string | null;
  co2Off: string | null;
}): string {
  const span = (on: string | null, off: string | null) =>
    on && off ? `${on}–${off}` : on ? `on ${on}` : off ? `off ${off}` : null;
  const lights = span(t.lightsOn, t.lightsOff);
  const co2 = span(t.co2On, t.co2Off);
  return [lights && `Lights ${lights}`, co2 && `CO₂ ${co2}`]
    .filter(Boolean)
    .join(" · ");
}

// ── Schedules on equipment (#25) ────────────────────────────────────────────
// A light, CO₂, pump or anything that doesn't run all day has periods it runs
// in ("08:00"–"12:00" and "14:00"–"18:00" for a siesta), and lights can ramp
// up and down. A tank's lighting is the schedule on its light, else the
// lights on / off times on the tank itself.

export interface Period {
  on: string; // HH:MM
  off: string; // HH:MM; earlier than `on` runs across midnight
}
/** A period that can be saved: an on and an off time, not the same (#120: the form's preview and the server agree). */
export const isCompletePeriod = (p: Period) =>
  isTime(p.on) && isTime(p.off) && p.on !== p.off;

export interface Schedule {
  periods: Period[];
  /** lights: minutes to ramp up at the start and down at the end of each period */
  rampMin: number | null;
}

export const MAX_PERIODS = 6;
export const RAMP_OPTIONS = [0, 15, 30, 45, 60, 90, 120];

const mins = (s: string) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** A schedule read back from storage; null for anything that isn't one or has no periods. */
export function parseSchedule(v: unknown): Schedule | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { periods?: unknown; rampMin?: unknown };
  const periods = Array.isArray(o.periods)
    ? o.periods
        .filter(
          (p): p is Period =>
            !!p &&
            typeof p === "object" &&
            mins((p as Period).on) != null &&
            mins((p as Period).off) != null,
        )
        .slice(0, MAX_PERIODS)
    : [];
  if (!periods.length) return null;
  const ramp =
    typeof o.rampMin === "number" && o.rampMin > 0
      ? Math.min(240, Math.round(o.rampMin))
      : null;
  return { periods, rampMin: ramp };
}

/** Hours a schedule runs in a day, over all its periods. */
export function scheduleTotalHours(s: Schedule | null | undefined): number | null {
  if (!s) return null;
  const total = s.periods.reduce((n, p) => n + (scheduleHours(p.on, p.off) ?? 0), 0);
  return Math.round(total * 100) / 100;
}

/** "08:00–12:00, 14:00–18:00" */
export const periodsText = (s: Schedule) =>
  s.periods.map((p) => `${p.on}–${p.off}`).join(", ");

/** "08:00–12:00, 14:00–18:00 · 8 h · ramps 30 min" */
export function scheduleLabel(s: Schedule | null | undefined): string {
  if (!s) return "All day";
  const h = scheduleTotalHours(s);
  return [periodsText(s), h != null && hoursText(h), s.rampMin && `ramps ${s.rampMin} min`]
    .filter(Boolean)
    .join(" · ");
}

/** Whether a schedule has it on at "HH:MM". Always on without one. */
export function isOnAt(s: Schedule | null | undefined, time: string): boolean {
  if (!s) return true;
  const t = mins(time);
  if (t == null) return true;
  return s.periods.some((p) => {
    const a = mins(p.on)!;
    const b = mins(p.off)!;
    return a <= b ? t >= a && t < b : t >= a || t < b;
  });
}

/** "● On now · off at 18:00" / "○ Off · on at 08:00", never color alone. */
export function onNowText(s: Schedule | null | undefined, time: string): { on: boolean; text: string } {
  if (!s) return { on: true, text: "● On" };
  const t = mins(time) ?? 0;
  const on = isOnAt(s, time);
  // the next change after now, across midnight
  const edges = s.periods
    .flatMap((p) => [
      { at: mins(p.on)!, to: true },
      { at: mins(p.off)!, to: false },
    ])
    .filter((e) => e.to !== on)
    .map((e) => ({ ...e, wait: (e.at - t + 1440) % 1440 }))
    .sort((a, b) => a.wait - b.wait);
  const next = edges[0];
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return {
    on,
    text: on
      ? `● On now${next ? ` · off at ${hhmm(next.at)}` : ""}`
      : `○ Off${next ? ` · on at ${hhmm(next.at)}` : ""}`,
  };
}

/** An item with a schedule, as the tank's lighting or CO₂ reads it. */
export interface ScheduledItem {
  id: string;
  type: EquipmentType;
  name: string;
  schedule: Schedule;
}

/**
 * A tank's lighting and CO₂ times: the schedule on its light (or CO₂ item)
 * when it has one, else the on / off pair on the tank itself.
 */
export function tankLighting(
  tank: { lightsOn: string | null; lightsOff: string | null; co2On: string | null; co2Off: string | null; photoperiodH: number | null },
  items: ScheduledItem[],
): {
  lights: { schedule: Schedule; hours: number | null; item: ScheduledItem | null } | null;
  co2: { schedule: Schedule; hours: number | null; item: ScheduledItem | null } | null;
  photoperiodH: number | null;
} {
  const pick = (type: EquipmentType, on: string | null, off: string | null) => {
    const item = items.find((i) => i.type === type) ?? null;
    const schedule = item?.schedule ?? (on && off ? { periods: [{ on, off }], rampMin: null } : null);
    return schedule ? { schedule, hours: scheduleTotalHours(schedule), item } : null;
  };
  const lights = pick("light", tank.lightsOn, tank.lightsOff);
  const co2 = pick("co2", tank.co2On, tank.co2Off);
  return { lights, co2, photoperiodH: lights?.hours ?? tank.photoperiodH };
}

/** "Lights 08:00–12:00, 14:00–18:00 · CO₂ 07:00–15:00", from the items' schedules first; "" when neither is set. */
export function lightingText(
  tank: { lightsOn: string | null; lightsOff: string | null; co2On: string | null; co2Off: string | null; photoperiodH: number | null },
  items: ScheduledItem[],
): string {
  const l = tankLighting(tank, items);
  return [l.lights && `Lights ${periodsText(l.lights.schedule)}`, l.co2 && `CO₂ ${periodsText(l.co2.schedule)}`]
    .filter(Boolean)
    .join(" · ");
}

// ── From a product barcode (#147) ───────────────────────────────────────────

/** Words in a product's listing that say what it is, in the order they decide. */
const TYPE_WORDS: [EquipmentType, RegExp][] = [
  ["doser", /\bdosers?\b|\bdosing pump\b|\bauto[- ]?dos(?:er|ing)\b/i],
  ["co2", /\bco2\b|co₂|\bcarbon dioxide\b|\bregulator\b|\bdiffuser\b|\bsolenoid\b|\bbubble counter\b/i],
  ["skimmer", /\bskimmer\b/i],
  ["heater", /\bheaters?\b|\bthermostat\b/i],
  ["filter", /\bfilters?\b|\bfiltration\b|\bcanister\b|\bhang-?on\b|\bhob\b/i],
  ["light", /\blights?\b|\blighting\b|\bled\b|\blamp\b|\bfixture\b/i],
  ["pump", /\bpumps?\b|\bpowerhead\b|\bwave ?maker\b|\bcirculation\b/i],
];

/** The type a product's name suggests: "Fluval 407 Performance Canister Filter" is a filter; `other` when nothing says. */
export function guessEquipmentType(text: string): EquipmentType {
  for (const [type, re] of TYPE_WORDS) if (re.test(text)) return type;
  return "other";
}

const GENERIC_FIRST_WORDS = /^(aquarium|fish|tank|the|a|an|new|premium|submersible|adjustable|mini|large|small)$/i;

/**
 * Brand and model from a product listing's name: "Fluval 407 Performance
 * Canister Filter, Aquarium Filter for up to 100 Gallons" with brand "Fluval"
 * is brand "Fluval", model "407 Performance Canister Filter". The name is cut
 * where listings start the sales pitch (a comma, a dash, a pipe, a bracket,
 * "for", "with", "up to"); a brand in capitals is written as a name; without a
 * brand given, the first word is taken as one when it's a word, not a size.
 */
export function brandAndModel(
  title: string,
  brand: string | null | undefined,
): { brand: string; model: string } {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  let name = clean(title);
  const cut = /\s+[-–—|]\s+|,\s|\s\(|\s+for\s+|\s+with\s+|\s+up to\s+/i.exec(name);
  if (cut && cut.index >= 3) name = name.slice(0, cut.index).trim();
  let b = clean(brand ?? "");
  if (b.length > 3 && b === b.toUpperCase()) b = b[0] + b.slice(1).toLowerCase();
  if (!b) {
    const first = /^([A-Za-z][A-Za-z&'.-]+)\s+\S/.exec(name)?.[1] ?? "";
    if (first && !GENERIC_FIRST_WORDS.test(first)) b = first;
  }
  let model = name;
  if (b && model.toLowerCase().startsWith(b.toLowerCase())) model = model.slice(b.length);
  model = model.replace(/^[\s:,-]+|[\s:,-]+$/g, "");
  if (!model && name.toLowerCase() !== b.toLowerCase()) model = name;
  return { brand: b.slice(0, 60), model: model.slice(0, 60) };
}
