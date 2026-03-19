# LocalPDF — PostHog analytics snapshot (2026-03-16)

Time range used unless noted otherwise: last 30 days.

## Executive summary

LocalPDF already has a meaningful analytics baseline in PostHog. The product currently shows a healthy mix of:

- web traffic to the main site and SEO landing pages
- app navigation into tool-specific flows
- first product-level execution telemetry (`app_tool_run_started`, `app_tool_run_success`, `app_tool_run_error`)

The strongest immediate patterns:

1. **Traffic is real and diversified** — not just homepage visits, but also clear demand for SEO pages and hash/app routes.
2. **Merge and OCR stand out as important use cases** from page demand and tool activity.
3. **Tool runtime is already measurable** via `duration_ms` on `app_tool_run_success`, which is enough to monitor performance now.
4. **Tracking is useful but still incomplete** for deeper funnel work — execution telemetry exists, but conversion stitching and naming discipline should improve.

## Core traffic and usage metrics

- **MAU:** 2,080
- **WAU:** 501
- **DAU on 2026-03-16:** 67

### Daily active users pattern

The strongest days in the last 30 days were:

- 2026-02-26 — 130 DAU
- 2026-03-10 — 123
- 2026-03-03 — 119
- 2026-03-04 — 117
- 2026-02-25 — 114

Recent days were weaker:

- 2026-03-13 — 57
- 2026-03-14 — 49
- 2026-03-15 — 53
- 2026-03-16 — 67

### Interpretation

- There was a stronger acquisition/engagement window in late February to early March.
- The latest few days are softer, but not dead.
- This looks more like uneven acquisition / SEO / campaign demand than a fully flat retention pattern.

## Top tracked events

Top events in the last 30 days:

- `$web_vitals` — 7,234
- `$pageview` — 6,024
- `$pageleave` — 4,845
- `app_tool_run_started` — 29
- `app_tool_run_success` — 25
- `app_tool_run_error` — 3

### Interpretation

- Web analytics is the dominant signal today.
- Product execution analytics exists, which is excellent, but event volume is still relatively small.
- Current telemetry is already enough for a lightweight operational dashboard.

## Top pages by pageviews

Top page URLs in the last 30 days:

1. `https://localpdf.online/` — 1,704
2. `https://localpdf.online/app#` — 1,089
3. `https://localpdf.online/app#merge` — 370
4. `https://localpdf.online/merge-pdf` — 340
5. `https://localpdf.online/app` — 204
6. `https://localpdf.online/ja` — 158
7. `https://localpdf.online/ocr-pdf` — 138
8. `https://localpdf.online/app#ocr` — 116
9. `https://localpdf.online/compress-pdf` — 108
10. `https://localpdf.online/extract-images-pdf` — 94

Additional visible routes:

- `/app#split` — 83
- `/app#compress` — 79
- `/extension` — 70
- `/app#watermark` — 66
- `/app#rotate` — 59

### Interpretation

- The homepage remains the main entry point.
- There is clear usage of both:
  - SEO landing pages (`/merge-pdf`, `/ocr-pdf`, `/compress-pdf`, etc.)
  - app-driven routes (`/app#merge`, `/app#ocr`, etc.)
- **Merge appears to be the strongest immediate use case** from combined page demand.
- OCR is also important and likely deserves dedicated optimization because it shows both traffic and measurable runtime cost.

## Tool execution telemetry

The following execution events exist:

- `app_tool_run_started`
- `app_tool_run_success`
- `app_tool_run_error`

Important properties observed in recent events:

- `tool_id`
- `duration_ms` (on success events)
- `input_count`
- `output_count`
- `total_input_size`
- entry/session/referrer context fields

### Why this matters

This means LocalPDF can already answer practical product questions such as:

- which tools are used most
- which tools are slowest
- what traffic sources produce successful runs
- how runtime changes with file size

## Runtime performance findings

Successful tool runs in the last 30 days:

| Tool | Successful runs | Avg ms | P50 ms | P90 ms | Max ms |
|---|---:|---:|---:|---:|---:|
| `ocr-pdf` | 10 | 34,451 | 30,983.5 | 58,737.8 | 59,753 |
| `pdf-to-jpg` | 7 | 994 | 542 | 2,383.6 | 3,580 |
| `compress-pdf` | 6 | 651 | 321.5 | 1,447.5 | 1,612 |
| `extract-images` | 2 | 2,060 | 2,060.5 | 3,111.3 | 3,374 |

Error runs observed in the last 30 days:

| Tool | Error count |
|---|---:|
| `pdf-to-jpg` | 3 |

### Interpretation

- **OCR is by far the slowest tool family** in current tracked usage.
  - This is not surprising, but the gap is large enough to justify special UX and performance attention.
- `compress-pdf` is currently very fast.
- `pdf-to-jpg` is generally fast when successful, but currently has the only visible error cluster.
- `extract-images` is light-volume but not concerning so far.

## Entry URLs behind successful runs

Top entry URLs associated with successful runs:

- `https://localpdf.online/` — 8
- `https://localpdf.online/app#ocr` — 5
- `https://localpdf.online/features/ocr-pdf` — 3
- `https://localpdf.online/features/merge-pdf` — 2
- `https://localpdf.online/app` — 2
- `https://localpdf.online/app#` — 2

### Interpretation

- The homepage is still the main successful entry path.
- OCR already has evidence of successful conversion from both:
  - app route entry (`/app#ocr`)
  - feature/landing entry (`/features/ocr-pdf`)
- This suggests OCR is not just attracting traffic, but producing meaningful completions.

## Strategic conclusions

### 1) Merge is the clearest broad-demand use case

Merge has strong visibility from both SEO and app routing. It is likely one of the best candidates for:

- homepage emphasis
- SEO expansion
- conversion optimization
- tighter event instrumentation

### 2) OCR is strategically important because it is both demanded and expensive

OCR is a high-value flow because:

- it shows up in landing traffic
- it leads to successful runs
- it has the highest execution time by far

This makes OCR the strongest candidate for:

- dedicated UX messaging around wait time
- progress indicators / “processing” states
- performance optimization work
- reliability monitoring

### 3) Runtime telemetry is already good enough for performance reporting

Because `duration_ms` is present on success events, LocalPDF can immediately support:

- average runtime by tool
- percentile reporting (p50 / p90)
- regression tracking after deployment
- “slowest tool” monitoring

This is a strong foundation and should be expanded, not replaced.

### 4) Current funnel telemetry is useful but not yet decision-grade everywhere

The product already emits execution events, but deeper funnel analysis still needs stronger instrumentation discipline.

Main gaps to close:

- stronger linkage from landing page -> tool start -> success/error
- stable run identifiers if not already emitted explicitly
- consistent event naming across all tool families
- explicit “upload completed”, “conversion finished”, “download clicked” style milestones

## Recommended next actions

### High priority

1. **Audit `pdf-to-jpg` failures**
   - It is the only tool with visible error counts in the current 30-day sample.
   - Check whether these are user/data issues or real product faults.

2. **Create a performance dashboard by `tool_id`**
   - Track runs, success rate, avg runtime, p50, p90, max.
   - OCR should be watched separately.

3. **Improve OCR completion UX**
   - Because OCR is slow, user trust likely depends on progress feedback and expectation-setting.

4. **Instrument a cleaner funnel**
   - Suggested milestones:
     - landing viewed
     - upload started
     - upload completed
     - tool run started
     - tool run success / error
     - download clicked

### Medium priority

5. **Analyze landing-page-to-tool conversion**
   - Especially for merge and OCR.
   - Determine whether SEO pages drive actual successful runs or just informational traffic.

6. **Normalize page taxonomy**
   - There is currently a mix of homepage, feature pages, `/app`, and hash routes.
   - This is workable, but a normalized page grouping layer would make reporting cleaner.

7. **Track file-size vs runtime**
   - `total_input_size` already appears in event payloads.
   - This should be used to separate “tool is slow” from “user uploaded huge file.”

## Recommended reporting cuts next

The next most valuable analytics slices are:

1. conversion by landing page
2. success/error rate by tool
3. runtime by tool and file size bucket
4. traffic source -> successful run
5. homepage vs SEO page conversion quality

## Bottom line

LocalPDF already has enough PostHog instrumentation to support real product decisions.

The strongest current opportunities are:

- **double down on merge as the broadest demand path**
- **treat OCR as the most operationally sensitive flow**
- **tighten funnel instrumentation so acquisition can be tied to successful tool outcomes**
