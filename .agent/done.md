# Completed Tasks

## 2026-04-23

### CLEANUP-01: Repo cleanup
- Removed from git: `.gemini-home/`, `.playwright-cli/`, `generate-large.js/mjs`, `test-output/`, `AGENTS.md`, `LLM_GUARD.md`, `MODEL.md`, `FAILURE_MODES.md`, `TESTING_RULES.md`, `QA_AUDIT_REPORT.md`, `MEMORY.md`, `docs/` (29 files), `skills/localpdf-seo/references/`
- Fixed `website/package.json` (IndexNow scripts had overwritten dev/build/preview scripts + Astro deps)
- Updated `.gitignore` with AI tool dirs, operational docs, IndexNow files
- Commit: pending

### ANALYSIS-01: PostHog analytics snapshot
- Pulled 30-day data: events, funnel, tools, upsell reasons, traffic sources, countries, errors
- Key finding: 70% drop-off before tool run, OCR is #1 upgrade trigger, checkout only from /pricing (0 from in-app)
- Saved to: `~/.claude/projects/-Users-aleksejs-Desktop-LocalPDF-V6/memory/analytics_snapshot.md`

### ANALYSIS-02: Product & sales audit
- Code audit: architecture, billing, security, paywall flow
- UX audit: empty state problem, toolbar issues, nav confusion
- Growth plan created with 9 tasks across 3 priority levels

## 2026-06-08

### TOC-01: Auto-TOC tool refactoring & bugs fix
- Refactored `TocTree.tsx` to use `id`-based callbacks instead of fragile array indices recursion, resolving index sync issues.
- Fixed blank Document Structure sidebar bug in PDF viewers by mapping PDF Outlines dictionaries (Type, Subtype, S, D, XYZ) to correct `PDFName` objects (instead of plain strings).
- Added `PDFHexString.fromText` to outline titles for robust UTF-16 Cyrillic/Baltic languages support in all PDF readers.
- Fixed 404 font load error in worker by utilizing `import.meta.env.BASE_URL` to dynamically construct font asset URLs.
- Removed unsupported/broken Noto Sans WOFF files, falling back to all-inclusive TrueType `Roboto` font to render Baltic and Cyrillic glyphs.
- Placed TOC button right under OCR inside the sidebar, added a custom styled red \"NEW\" badge, and added informative tooltip descriptions to all 12 tools in the rail.
- Added a \"Back to Edit\" option to the results card, wrapped the final screen layout into a clean center-aligned card, and fixed button contrast issues.
- Commit: `feat(auto-toc): refactor TOC UI, fix PDF outlines rendering, add search filter and tool descriptions`
