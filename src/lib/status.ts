// Parameter status against a tank's target range. See README → Parameter status.
//
// - out of range ("bad") if v < min or v > max
// - near limit ("warn") if in range and within 10% of (max − min) of a bound,
//   when min > 0; when min is 0 (ammonia, nitrite: "≤ 0.25 ppm", should read
//   0) any reading above 0 is near high (#63)
// - in range ("ok") otherwise; "none" when there is no reading
//
// Status is never color-only: always pair `level` with `statusIcon` + label.

export type StatusLevel = "ok" | "warn" | "bad" | "none";
export type StatusDirection = "low" | "high" | null;

export interface Status {
  level: StatusLevel;
  direction: StatusDirection;
}

export interface Range {
  min: number | null;
  max: number | null;
}

export const NEAR_FRACTION = 0.1;

// Small tolerance so a value that round-trips through unit conversion
// (e.g. 80 °F → 26.666…°C → 80 °F) is not flagged for floating-point noise.
const EPS = 1e-9;

export function paramStatus(
  value: number | null | undefined,
  range: Range,
): Status {
  if (value == null || Number.isNaN(value))
    return { level: "none", direction: null };
  const { min, max } = range;
  if (min != null && value < min - EPS)
    return { level: "bad", direction: "low" };
  if (max != null && value > max + EPS)
    return { level: "bad", direction: "high" };
  if (min === 0 && max != null && max > 0 && value > EPS)
    return { level: "warn", direction: "high" };
  if (min != null && max != null && min > 0 && max > min) {
    const margin = (max - min) * NEAR_FRACTION;
    if (value - min < margin - EPS) return { level: "warn", direction: "low" };
    if (max - value < margin - EPS) return { level: "warn", direction: "high" };
  }
  return { level: "ok", direction: null };
}

export const statusIcon: Record<StatusLevel, string> = {
  ok: "✓",
  warn: "▲",
  bad: "✕",
  none: "–",
};

/** Short label for cards: "✓ OK", "▲ Near low", "✕ High", "– No data". */
export function statusShort(s: Status): string {
  switch (s.level) {
    case "ok":
      return "✓ OK";
    case "warn":
      return s.direction === "high" ? "▲ Near high" : "▲ Near low";
    case "bad":
      return s.direction === "high" ? "✕ High" : "✕ Low";
    default:
      return "– No data";
  }
}

/** Label for entry detail and edit forms: "✓ In range", "▲ Near limit", "✕ High". */
export function statusMedium(s: Status): string {
  switch (s.level) {
    case "ok":
      return "✓ In range";
    case "warn":
      return "▲ Near limit";
    case "bad":
      return s.direction === "high" ? "✕ High" : "✕ Low";
    default:
      return "– No data";
  }
}

/** Inline form message: "✕ Above target 5–20 ppm", "▲ Near limit · 2–5 dKH". */
export function statusLong(s: Status, rangeText: string): string {
  switch (s.level) {
    case "ok":
      return "✓ In range";
    case "warn":
      return `▲ Near limit · ${rangeText}`;
    case "bad":
      return `✕ ${s.direction === "high" ? "Above" : "Below"} target ${rangeText}`;
    default:
      return "";
  }
}

/**
 * Human range text in display units: "5–20 ppm", "≤ 0.25 ppm", "≥ 2 dKH",
 * or "" when there is no target.
 */
export function rangeText(
  min: string | null,
  max: string | null,
  unit: string,
  minIsZero = false,
): string {
  const u = unit ? ` ${unit}` : "";
  if (max != null && (min == null || minIsZero)) return `≤ ${max}${u}`;
  if (min != null && max == null) return `≥ ${min}${u}`;
  if (min != null && max != null) return `${min}–${max}${u}`;
  return "";
}

// ── Cycling ─────────────────────────────────────────────────────────────────
// A new tank cycling (tanks.cycling): ammonia and nitrite above target are a
// stage of the cycle, not a failure, so they show as "▲ Cycling" instead of
// "✕ High". statusOf's contract is unchanged; callers soften the result.

export const CYCLING_KEYS = ["nh3", "no2"];
export const CYCLING_TEXT = "▲ Cycling";

/** The status to show while the tank is cycling: a high ammonia or nitrite reading becomes a warn. */
export function cyclingLevel(key: string, s: Status, cycling: boolean): Status {
  if (
    cycling &&
    CYCLING_KEYS.includes(key) &&
    s.level === "bad" &&
    s.direction === "high"
  )
    return { level: "warn", direction: "high" };
  return s;
}

/** Whether a status was softened by cyclingLevel (to label it "▲ Cycling"). */
export function isCyclingStatus(
  key: string,
  s: Status,
  cycling: boolean,
): boolean {
  return (
    cycling &&
    CYCLING_KEYS.includes(key) &&
    s.level === "warn" &&
    s.direction === "high"
  );
}

export interface CycleTest {
  nh3?: number | null;
  no2?: number | null;
  no3?: number | null;
}

/** Tests in a row, newest first, with ammonia and nitrite both at 0, before it counts as cycled. */
export const CYCLED_TESTS = 3;

/**
 * Where the cycle is, in plain words, from the tests newest first:
 * ammonia rising (first stage), ammonia falling and nitrite rising (second),
 * nitrite falling and nitrate rising (last), or both at 0 for CYCLED_TESTS
 * tests (cycled). `cycled` says the Mark as running nudge applies.
 */
export function cyclingStage(tests: CycleTest[]): {
  text: string;
  cycled: boolean;
} {
  const has = (t: CycleTest, k: keyof CycleTest) => t[k] != null;
  const withAmmonia = tests.filter((t) => has(t, "nh3") || has(t, "no2"));
  if (!withAmmonia.length)
    return {
      text: "Log ammonia, nitrite and nitrate with each test to follow the cycle.",
      cycled: false,
    };
  // clean tests in a row, newest first (a test missing either doesn't count or break it)
  let clean = 0;
  for (const t of tests) {
    const both = [t.nh3, t.no2].filter((v): v is number => v != null);
    if (both.some((v) => v > 0)) break;
    if (both.length === 2) clean++;
  }
  if (clean >= CYCLED_TESTS)
    return {
      text: `Ammonia and nitrite have read 0 for ${clean} tests: it's cycled. Mark it running?`,
      cycled: true,
    };
  if (clean > 0)
    return {
      text: `Ammonia and nitrite read 0 on the last ${clean === 1 ? "test" : `${clean} tests`}: ${CYCLED_TESTS - clean} more clean test${CYCLED_TESTS - clean === 1 ? "" : "s"} and it's cycled.`,
      cycled: false,
    };
  const latest = tests[0];
  const prev = tests
    .slice(1)
    .find((t) => has(t, "nh3") || has(t, "no2") || has(t, "no3"));
  const dir = (k: keyof CycleTest): "up" | "down" | "flat" | null => {
    if (!prev || latest[k] == null || prev[k] == null) return null;
    return latest[k]! > prev[k]!
      ? "up"
      : latest[k]! < prev[k]!
        ? "down"
        : "flat";
  };
  const nh3 = dir("nh3");
  const no2 = dir("no2");
  const no3 = dir("no3");
  if (nh3 === "down" && no2 === "up")
    return {
      text: "Ammonia is falling and nitrite is rising: the second stage.",
      cycled: false,
    };
  if (no2 === "down" && (no3 === "up" || (latest.nh3 ?? 0) === 0))
    return {
      text: "Nitrite is falling and nitrate is rising: the last stage.",
      cycled: false,
    };
  if ((latest.no2 ?? 0) > 0 && (latest.nh3 ?? 0) === 0)
    return {
      text: "Ammonia is at 0 and nitrite is up: the second stage.",
      cycled: false,
    };
  if ((latest.nh3 ?? 0) > 0 && !(latest.no2 ?? 0))
    return {
      text:
        nh3 === "down"
          ? "Ammonia is falling: the first stage is ending."
          : "Ammonia is rising: the first stage.",
      cycled: false,
    };
  if ((latest.nh3 ?? 0) > 0 && (latest.no2 ?? 0) > 0)
    return {
      text: "Ammonia and nitrite are both up: the second stage.",
      cycled: false,
    };
  return {
    text: "Keep testing every day or two to follow the cycle.",
    cycled: false,
  };
}

// ── Test cadence ─────────────────────────────────────────────────────────────
// Parameters & targets: how often each parameter should be tested
// (tank_parameters.test_every_days). A reading older than that is due.

export const TEST_CADENCES: { days: number | null; label: string }[] = [
  { days: null, label: "—" },
  { days: 3, label: "3 days" },
  { days: 7, label: "Week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "Month" },
  { days: 90, label: "3 months" },
];

/** The cadence as sent by the form ("7", "", "abc"): a known number of days, or null for none. */
export function parseTestEvery(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return Math.min(n, 3650);
}

/** Days since the reading, when it's older than its cadence; null when it's fresh or there's no cadence. */
export function staleAfter(
  lastDay: string | null,
  today: string,
  everyDays: number | null,
): number | null {
  if (!everyDays || !lastDay) return null;
  const a = Date.parse(lastDay.slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(today.slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const days = Math.round((b - a) / 86_400_000);
  return days > everyDays ? days : null;
}

export const isStale = (
  lastDay: string | null,
  today: string,
  everyDays: number | null,
) => staleAfter(lastDay, today, everyDays) != null;
