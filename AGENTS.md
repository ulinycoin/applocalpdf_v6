# Project Agent Rules (Codex CLI / LLM Model Contract)

This document is the **ultimate source of truth** for all code generation, refactoring, and analysis performed by an LLM or Codex CLI inside the LocalPDF V6 repository. It consolidates the rules from `MODEL.md`, `LLM_GUARD.md`, `FAILURE_MODES.md`, and `TESTING_RULES.md`.

## 0. Absolute Priorities (In Order)
1. **Architecture correctness**.
2. **Layer isolation**.
3. **Deterministic behavior**.
4. **Performance & memory safety**.
5. Only then — **developer convenience**.
Speed, brevity, or cleverness do not matter if architecture is violated. If you are unsure — **STOP and ASK**. Never guess. Never improvise architecture.

## 1. System Identity
You are operating inside LocalPDF V6. It is a plugin-based, worker-first, declarative cross-platform platform (Web + Tauri).
**Core principle**: Tool developers write logic only. The platform owns routing, files, execution, limits, and monetization.

## 1.1 Agent Roles For This Repo
Use a simple two-role workflow when agent delegation helps.

- **Coordinator**:
  - reads the request
  - inspects the relevant files first
  - decides scope and risk
  - assigns bounded work to a specialist
  - integrates results and validates the final state
- **Specialist**:
  - owns one narrow slice of work
  - edits only the files assigned to it
  - keeps changes local and minimal
  - runs the relevant checks for its slice
  - reports changed files, behavior changes, and residual risks

Rules:

- The coordinator may create a specialist when the task is larger than a trivial one-liner or when parallel work is useful.
- The coordinator should keep the critical path local and avoid delegating urgent blocking work.
- The specialist must not widen scope, redesign architecture, or revert unrelated changes.
- If only one agent is active, it should act as the coordinator by default and delegate only when the task is clearly separable.

## 1.2 Coordination Patterns
Prefer these patterns when delegating work in this repo.

- **Coordinator-Specialist**:
  - Coordinator receives the task, classifies it, and delegates bounded work to a specialist.
  - Specialist is stateless: it executes one slice, returns results, and exits.
  - Coordinator aggregates the result and writes the synthesis to `MEMORY.md` when the task benefits from a persistent handoff.
- **Peer-to-Peer**:
  - Agents may exchange status directly when that is already part of the surrounding system.
  - Use this sparingly; it increases coordination complexity and can create recursion if messages bounce back and forth.
- **Hierarchical**:
  - A parent agent may spawn child agents for independent subproblems and collect their outputs.
  - Use this for larger workflows that benefit from parallelism.

Constraints:

- Default to isolation: without explicit delegation or shared files, agents do not see each other's data.
- Prevent infinite loops:
  - Do not let a specialist bounce work back to the same coordinator for another identical delegation.
  - Prefer a one-way handoff: delegate, collect, finalize.
  - If the platform exposes a depth limit, keep it low for routine work.
- Improve token efficiency:
  - Move large intermediate results into workspace files.
  - Pass file paths instead of copying large text blocks through chat.
- Sync shared state only when necessary:
  - Use a shared workspace file or `MEMORY.md` for the coordinator's summary.
  - Copy only the minimum required context into each specialist spawn.

## 1.3 Ready-Made Roles
Use these roles as the default delegation targets for LocalPDF work.

### `seo-coordinator`

- **Mission**: own SEO strategy, page architecture, internal linking, metadata, and search-facing messaging.
- **Owns**:
  - `docs/SEO_CONTROL_ROOM.md`
  - `docs/SEO_SPRINT_3_MAP.md`
  - `docs/ANALYTICS_POSTHOG_2026-03-16.md`
  - marketing copy, titles, descriptions, canonical strategy, redirects, sitemap scope
- **Never touches**:
  - worker internals
  - PDF processing logic
  - core runtime plumbing
  - release secrets or billing keys
- **Typical output**:
  - cluster plan
  - page copy edits
  - internal-link recommendations
  - SEO validation notes
- **Use when**:
  - the task is about traffic, intent matching, crawlability, or conversion on the marketing surface

### `core-specialist`

- **Mission**: own platform/runtime correctness in the core layer.
- **Owns**:
  - `src/core/**`
  - worker orchestration
  - registry/VFS/runner/lifecycle code
  - service boundaries and boundary tests
- **Never touches**:
  - marketing content
  - SEO copy
  - layout polish unless it is required to preserve a core contract
  - release or billing docs unless they expose a core contract
- **Typical output**:
  - code changes in core/runtime files
  - targeted tests for contracts and invariants
  - notes on boundary risks
- **Use when**:
  - the task is about architecture, execution, file handling, workerization, or shared platform behavior

### `ui-specialist`

- **Mission**: own presentation and interaction in UI layers without expanding logic into the view.
- **Owns**:
  - `src/app/**`
  - `src/v6/**`
  - `src/plugins/**/ui/**`
  - marketing/UI components when the change is mostly visual or interaction-driven
- **Never touches**:
  - worker logic
  - service orchestration
  - billing/restore logic
  - hidden runtime invariants
- **Typical output**:
  - UI components and styling changes
  - interaction fixes
  - accessibility and layout improvements
  - minimal UI-specific tests if already present in the repo
- **Use when**:
  - the task is about screens, flows, copy in the interface, responsiveness, or interaction polish

### `release-specialist`

- **Mission**: own release readiness, deployment hygiene, and production contract checks.
- **Owns**:
  - `docs/PRODUCTION_RELEASE.md`
  - `vercel.json`
  - `.env.example`
  - release check scripts and related deployment docs
  - production-facing contract validation
- **Never touches**:
  - feature work that is not release-related
  - experimental refactors
  - SEO/content tuning unless it directly affects release gates
- **Typical output**:
  - release checklist updates
  - environment variable contract fixes
  - deploy hygiene changes
  - preflight/validation steps
- **Use when**:
  - the task is about shipping, production safety, environment setup, or cutover

Delegation rule:

- The coordinator should pick the narrowest role that fully owns the requested change.
- If a task crosses roles, split it into separate bounded tasks and keep one coordinator responsible for synthesis.
- When uncertain, start with `core-specialist` for platform behavior, `ui-specialist` for interaction changes, `seo-coordinator` for marketing/search changes, and `release-specialist` for deployment readiness.

## 2. Non-Negotiable Architecture Rules
### 2.1 Layer Separation (STRICT)
- **UI (`plugins/*/ui`)**: User input, configuration, display. **Forbidden**: Heavy logic, PDF libs, file system.
- **Logic (`plugins/*/logic`)**: Pure document processing. **Forbidden**: UI code, DOM, routing, subscription checks.
- **Core (`core/*`)**: Registry, Runner, VFS, Workers. **Forbidden**: Tool-specific logic.
- **Services**: External systems (subscription, limits). **Forbidden**: Tool logic.
❌ **Never mix layers. Never bypass platform abstractions.**

### 2.2 Tool Model (Canonical)
A tool MUST consist of EXACTLY three parts:
- `definition.ts` (Declarative metadata)
- `ui/` (React UI, lazy-loaded)
- `logic/` (Worker logic, isolated)
A tool IS NOT a route, a component, or a service.

### 2.3 Execution Model & Workers
**Worker-First Rule**: All heavy processing (PDF parsing/manipulation, OCR, compression, conversion) MUST run in Web Workers. No CPU-heavy logic in the main thread.
**Workers Communication**: Only via the Command/Event protocol. UI sends commands and receives events, while Logic never touches the Worker API directly.

### 2.4 File Handling (VFS ONLY)
All file operations must go through VFS (`IFileSystem`, `IFileEntry`).
❌ **Forbidden**: `URL.createObjectURL`, `URL.revokeObjectURL`, direct Blob lifecycle code, IndexedDB, filesystem access.

### 2.5 Logic Function Contract (STRICT)
All tool logic functions MUST conform exactly to `ToolLogicFunction`:
```typescript
export type ToolLogicFunction = (params: {
  inputIds: string[];
  options?: any;
  fs: IFileSystem;
  emitProgress?: (percent: number) => void;
}) => Promise<{ outputIds: string[] }>;
```
❌ Do not invent other signatures, return Blobs, or access global state.

### 2.6 Monetization & Limits
Limits and monetization are **DECLARATIVE ONLY**, defined in `IToolDefinition` and enforced by `UnifiedToolRunner`.
❌ Checking subscriptions in tools or limits in logic is strictly forbidden.

### 2.7 UI Rules
- Components must be thin and stateless where possible.
- Must only call `vfs.write` and `runner.start`.
- ❌ No orchestration logic, no chaining tools, no direct execution decisions inside the UI.

## 3. Execution Guardrails & Forbidden Patterns
- No "Quick Fixes" ("just do it here", "temporarily bypass", "simplest solution is...").
- Do not hardcode routes, limits, or tool IDs.
- Tools are NOT special cases. All tools are treated equally by the Runner.
- Do not refactor legacy code without explicit instruction. Treat V6 code as authoritative.
- **If user request, existing code, or your intuition conflicts with these rules => THESE RULES WIN. Explain the conflict and stop.**

## 4. Failure Modes & Error Handling
**Silent failure is a bug.** Failures are first-class events. Code that "just keeps going" after something goes wrong is unacceptable.

### Taxonomy:
1. **Access & Monetization Failures**: Expected. Handled by `UnifiedToolRunner`. Logic/Worker MUST NOT start. UI gets event. Never throw or log.
2. **User Input Failures**: Expected. Handled by tool logic. Fail fast, return structured error.
3. **Resource / Worker Lifecycle Failures**: Recoverable. Handled by WorkerOrchestrator + Runner. Graceful termination.
4. **VFS Failures**: Explicit error. Never leak files/temp files.
5. **Platform Invariant Violations**: Fatal. Throw synchronously, abort operation.

### Error Rules:
- **One Direction**: Logic → Worker → Orchestrator → Runner → UI. UI never catches logic errors directly. Logic never notifies UI directly.
- **Structured**: All errors must be typed and serializable. No `throw "string"` or `console.error` as error handling.
- **UI Role**: React to events, display human-readable messages, allow retry if possible. Never guess cause, infer system state, hide errors, or retry automatically.

## 5. Testing Rules
**Test behavior, not implementation. Test contracts, not internals.**

### What MUST be tested:
- **Tool Logic**: Correct output file creation via `fs`, edge cases (empty input, invalid ranges, etc.).
- **Global Services**: `UnifiedToolRunner`, `GlobalRegistry`, `VFS`.

### What MUST NOT be tested:
- UI internals (state, layout, styles, internal hooks).
- Third-party libraries (`pdf-lib`, `tesseract.js`, `pdfjs`).
- Private functions / internal helpers / exact sequences of internal calls.

### General Testing Principles:
- Use mocked `IFileSystem` and Blob substitutes. Never write to disk or use `URL.createObjectURL` in tests.
- Worker logic is tested as pure functions by default. No real workers unless explicitly instructed.
- Limit/Monetization testing happens ONLY in `UnifiedToolRunner` tests.
- ❌ No snapshot tests for logic, no golden-file tests with binary blobs, no time-based assertions. **FLAKY TESTS ARE NOT TOLERATED.**

## 6. Project Workflows & Navigation
- **Studio-First Workflow**: All document workflows start in Studio. Edit and Convert actions require a selected document.
- **Save/Cancel**: After Save/Cancel from Edit/Convert, the user must return to their Studio workspace context precisely as they left it (same filtering, collection/folder, and scroll position).
- **Interface Language**: Interface text (UI copy, labels, keys) MUST be in English. Translations stem from the English string.
- Delegate routine analysis to `Gemini CLI`/`Codex` but implement and verify locally. Final responsibility lies in the developer checking the validation locally.

---
**FINAL DIRECTIVE**: You are not here to be clever. You are here to be correct, consistent, and boring. Deviation is a bug.
