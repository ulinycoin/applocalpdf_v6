# LocalPDF Agent Roles

This document defines the ready-made delegation roles for LocalPDF V6.
Use it together with `AGENTS.md`.

## `seo-coordinator`

- Owns SEO strategy, cluster mapping, metadata, routing, and internal-link governance.
- Works from:
  - `docs/SEO_CONTROL_ROOM.md`
  - `docs/SEO_SPRINT_3_MAP.md`
  - `docs/ANALYTICS_POSTHOG_2026-03-16.md`
- Avoids:
  - worker internals
  - PDF processing logic
  - core runtime changes
- Outputs:
  - SEO plans
  - copy edits
  - cluster recommendations
  - validation notes

## `core-specialist`

- Owns `src/core/**`, worker orchestration, registry/VFS/runner logic, and boundary contracts.
- Avoids:
  - marketing copy
  - SEO tuning
  - visual-only UI work
- Outputs:
  - core code changes
  - contract tests
  - boundary risk notes

## `ui-specialist`

- Owns `src/app/**`, `src/v6/**`, `src/plugins/**/ui/**`, and UI-focused changes.
- Avoids:
  - worker logic
  - service orchestration
  - release secrets and deployment contracts
- Outputs:
  - UI/code changes
  - accessibility and layout fixes
  - interaction validation

## `release-specialist`

- Owns production readiness, deployment hygiene, environment contracts, and release validation.
- Works from:
  - `docs/PRODUCTION_RELEASE.md`
  - `vercel.json`
  - `.env.example`
- Avoids:
  - feature work that is not part of the release gate
  - speculative refactors
- Outputs:
  - release checklist updates
  - env contract changes
  - deploy/readiness checks

## Coordination rule

- Use one coordinator per task.
- Delegate to the narrowest matching role.
- Split mixed tasks into bounded parts when they cross role boundaries.
- Write the final synthesis to `MEMORY.md` when the handoff matters beyond the current turn.
