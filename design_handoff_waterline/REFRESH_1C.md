# Waterline dashboard refresh (direction 1c): implementation notes

Reference: `Waterline Refresh.dc.html` screens 1c, 2a (desktop dark), and 2b (phone light).
Scope: the dashboard (`src/routes/(app)/+page.svelte`) plus small token additions. Colors and Helvetica stay the same.

## 1. Tokens (`src/app.css`)

Add these to **both** theme blocks (dark in `:root`, light in `[data-theme='light']` and the `prefers-color-scheme` copy):

```css
/* dark */
--font-data: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
--waterline: linear-gradient(to right, var(--accent), transparent);
--warn-fill: #e8c060;          /* overdue part of the cadence bar */
--track: var(--surface-hi);
/* light */
--warn-fill: #c99a1e;          /* --warn (#8a6300) is too dark to read as a bar */
```

Add a utility next to `.mono`:

```css
.data { font-family: var(--font-data); font-variant-numeric: tabular-nums; font-weight: 500; }
.data-meta { font-family: var(--font-data); font-size: 12px; letter-spacing: 0.02em; text-transform: uppercase; }
```

Load the font. Self-host it in `static/fonts/` so it works offline and inside the service-worker cache (IBM Plex Mono 400/500/600, woff2), then:

```css
@font-face { font-family: 'IBM Plex Mono'; src: url('/fonts/IBMPlexMono-Medium.woff2') format('woff2'); font-weight: 500; font-display: swap; }
/* repeat for 400 and 600 */
```

Plex Mono is **only** for values, units, timestamps, and meta lines. Labels, headings, and buttons stay Helvetica.

## 2. New components

### `TankHero.svelte`: replaces `.head-row` / `.tank-head`
- A full-bleed cover photo: 220px tall on phones, 200px on desktop, `object-fit: cover`. With no cover, fall back to `.photo-placeholder`.
- The bottom gradient fades to `var(--bg)` so the name sits on the photo, not in a box:
  `background: linear-gradient(to bottom, transparent, var(--bg) 85%)`.
- Name: 28px/700 (32px on desktop) with the ▾ caret. Keep the existing tap-to-switch and swipe handlers.
- Meta line in `.data-meta`: `PLANTED · 40 GAL · DAY 214`. Day count = days since `tank.startDate`; drop it if there's no start date.
- AccountMenu moves to a 36px circle in the top-right on phones, on `var(--overlay-bg)`.
- Desktop only: `+ Quick add` sits top-right on the photo, and `LAST TEST 08:12 TODAY` sits bottom-right.
- Directly under the hero is the waterline: `<div class="waterline"></div>` with
  `height: 2px; margin-inline: 20px (32px desktop); background: var(--waterline);`.
  This is the only decorative element. Don't repeat it elsewhere.

### `AttentionList.svelte`: replaces `.summary-row` and the red ParamCards
One `.card` holding rows separated by `1px solid var(--divider-soft)`. Row types:

1. **Out-of-range or near-limit parameter** (`level === 'bad' | 'warn'`)
   - Grid `1fr 72px 84px` (desktop `1fr 160px 110px`), gap 10/20px, padding 14px 16px.
   - Left: name 16px/600, then an inline status (`✕ High` in `--bad`, `▲ Near low` in `--warn`, 13px). Under it, `Target 5–20` in 13px `--text-muted`.
   - Middle: a Sparkline **with the target band** (see §3), stroke colored by level.
   - Right: the value in `.data` at 22px (24px desktop), with the unit at 11px `--text-muted`. Right-aligned.
2. **Water change**, when `wcOver > 0` or `days >= goal`
   - Title + `▲ N day(s) over`. The right side shows `8 / 7 d` in `.data`.
   - Cadence bar: 6px tall, radius 3, `--track` background. Accent fill = `min(days, goal) / max(days, goal)`; `--warn-fill` covers the remainder when over.
   - Desktop: the bar goes in the middle column, and the subtitle reads `Every 7 days · last Sep 19`.

Order: bad params, then warn params, then water change. Section title `Needs attention` (17px/600) with `08:12 TODAY` in `.data-meta` on the right.
If nothing needs attention, don't render the section. The in-range header then shows `✓ All 11 in range`.

Red and amber tinted card fills (`.pcard.bad`, `.summary.bad`) are no longer used on the dashboard. Status appears through the glyph + word + colored text and sparkline only. That still meets the brief's rule that color is never the only signal.

### `InRangeList.svelte`: replaces the ParamCard grid for `ok` readings
- Header: `In range` plus `✓ 9 of 11` in `--ok`, 13px/700.
- Grid: 2 columns on phones, 3 on desktop, `column-gap: 24px` (28px desktop).
- Each row: `display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--divider-soft); font-size:15px`. Label in `--text-2`, value in `.data`. No unit (tap through for detail). Temperature keeps its `°F`/`°C`.
- The last row in each column has no border.
- Each row links to `/charts?p={id}`.
- `none` (not tested) params: list them in a single muted line under the grid, e.g. `Not tested: Magnesium, Calcium`, not as rows.

## 3. `Sparkline.svelte`: add an optional band

Right now it scales to the series' own min/max. To draw the target band, the scale has to include the band:

```ts
export function sparkPoints(values: number[], lo?: number | null, hi?: number | null) {
  const all = [...values, ...(lo != null ? [lo] : []), ...(hi != null ? [hi] : [])];
  const min = Math.min(...all), max = Math.max(...all);
  // ...same mapping, using min/max from `all`
}
const y = (v: number) => H - PAD - ((v - min) / (max - min)) * (H - 2 * PAD);
```

Render `<rect x="0" width={W} y={y(hi ?? max)} height={y(lo ?? min) - y(hi ?? max)} fill="var(--band)" />` before the polyline.
Keep the old signature working, because ParamCard still uses it elsewhere.

## 4. `+page.svelte` changes

- Remove `.head-row`, `.summary-row`, `.wc-small`, `.wc-large`, and the `.cards` grid of `ParamCard`.
- New order on phones: `TankHero` → waterline → `AttentionList` → `InRangeList` → Due → Trends → Recent → In the tank. The existing `order:` rules still apply.
- Desktop grid stays `minmax(0,1fr) 360px`. The hero spans both columns, above the grid, and bleeds past `.page` padding (`margin: -28px -32px 0`).
- Split `cards` by level: `attention = cards.filter(c => c.level === 'bad' || c.level === 'warn')`, `ok = cards.filter(c => c.level === 'ok')`, `untested = cards.filter(c => c.level === 'none')`.
- Pass `p.min` / `p.max` (converted with `displayValue`) through to the sparkline as `lo` / `hi`.
- Due list (desktop): status lines become `.data-meta`, e.g. `✕ 1 DAY OVER`, `▲ TODAY`, `SEP 29`. The primary button stays only on the most urgent task; the others are outlined.
- Recent activity (desktop): optionally add a 60px `.data-meta` date column on the left (`TODAY`, `SEP 25`).

## 5. Phone tab bar (small)

Add a 2px `--accent` top border to the active tab, sitting on the bar's top border (`margin-top:-1px`). Nothing else changes.

## 6. Don't

- Don't use Plex Mono for labels or body copy.
- Don't add more gradients or water motifs. One waterline per screen.
- Don't reintroduce tinted status cards on the dashboard. Other screens (log test form, tank list) can keep theirs for now.

## Check before merging
- Light and dark, 375px and 1280px widths.
- A tank with no cover photo, all readings in range, no readings, and no water change logged.
- Every text/background pair still meets WCAG AA contrast. `--text-muted` on a cover photo needs the gradient; test with a bright photo.
- e2e: `core-flow`, `polish`, `trends`, and `chart-readout` reference dashboard selectors, so update them.
