# LocalPDF V6 — Architecture Reference

Last updated: 2026-06-18

## Surfaces

| Path | Stack | Purpose |
|------|-------|---------|
| `src/` | React 18 + Vite | Product SPA mounted at `/app` |
| `website/` | Astro 6 | Marketing site at `/` |
| `api/` | Vercel serverless | Billing webhooks, server-side helpers |
| `shared/` | TS constants | Cross-surface shared values |

## `src/` layout

```
src/
├── main.tsx              # SPA entry, mounts PlatformApp
├── styles.css            # Global + Studio/Wizard styles
├── app/                  # App shell, routing, platform bootstrap
│   ├── platform/         # Runtime factory, billing, VFS wiring, plan limits
│   ├── routing/          # buildToolRoutes — one route per plugin
│   ├── navigation/       # Tool menu, studio categories
│   └── react/            # PlatformApp, sidebar, paywall, wizard shell glue
├── core/                 # Framework layer (no UI)
│   ├── types/contracts.ts  # All shared types + telemetry events
│   ├── vfs/              # Virtual file system (all file I/O)
│   ├── workers/          # WorkerOrchestrator — heavy work off main thread
│   ├── runner/           # UnifiedToolRunner
│   ├── telemetry/        # TelemetrySink, PostHog adapter
│   └── registry/         # GlobalRegistry — plugin discovery
├── plugins/<tool-id>/    # One folder per tool
│   ├── definition.ts     # Tool metadata, uiLoader, worker config
│   ├── logic/index.ts    # Tool logic ONLY (worker-safe)
│   └── ui/index.tsx      # View-only wizard UI
├── services/             # Shared engines (pdf, ocr)
└── v6/                   # Studio + Wizard UI (Konva canvas workspace)
    ├── components/Studio/  # StudioShell, tool rail, edit/convert workspaces
    ├── components/Wizard/  # WizardShell, upload/result stages
    ├── hooks/            # useWizardFlow, file previews
    └── studio/           # Navigation context, pipeline, thumbnails
```

## Key flows

**Standalone tool (wizard):** Sidebar → `/${toolId}` → plugin `ui/index.tsx` → `runTool()` → WorkerOrchestrator → VFS output → download.

**Studio:** `/studio` → Konva canvas with multi-document workspaces → tool rail opens in-place overlays (`StudioEditWorkspace`, `StudioConvertWorkspace`) or inline compress mode.

**File I/O:** Always through `runtime.vfs`. Never raw File/Blob persistence outside VFS.

**Billing:** `runtime.billing.getContext()` — never hardcode plan checks in plugins.

**Telemetry:** `runtime.telemetry.track()` with typed events from `RunnerTelemetryEvent` in `contracts.ts`.

## Plugin rules (ENGINEER)

1. Logic in `plugins/<name>/logic/index.ts` only
2. UI in `plugins/<name>/ui/index.tsx` — view-only, no business logic
3. Types/contracts in `src/core/types/contracts.ts` — do not duplicate
4. Heavy processing via WorkerOrchestrator, never main thread
5. No direct DOM manipulation — React + Konva only

## Tests & audits

- `npm test` — unit tests (Node test runner)
- `npm run build` — Vite SPA build
- `npm run audit:workerization:strict` — ensures tool logic stays workerized
- `e2e/` — Playwright (separate from unit tests)
