# Engineering Checklist (Execution Discipline)

## 1. Design Before Code
- Capture capability constraints of third-party libraries before integration.
- Document failure taxonomy and expected UX behavior for each failure code.
- Define contracts and acceptance criteria before implementation.

## 2. Implementation Rules
- No implicit fallbacks for unsupported capabilities.
- Return structured error codes for known failure modes.
- Keep orchestration in platform/core, logic in worker plugins, UI thin.
- UI layers (`src/app/react/**`, `src/v6/**`, `src/plugins/**/ui/**`) may import only public core API (`src/core/public/*`) and must not import core implementations.

## 3. Test Gates
- Unit tests for core contract changes.
- Integration test for `UI -> Runner -> Worker -> Logic -> VFS` path.
- `npm run audit:workerization:strict` is mandatory and release-blocking.
- `audit:workerization:strict` additionally enforces:
  - UI layers may import only `src/core/public/*`.
  - `src/core/**` may import `src/services/**` only from `src/core/workers/**`.
- CI green (`npm test`, `npm run build`) is mandatory before feature completion.
- E2E smoke (`npm run test:e2e`) is required on PRs targeting `main` / `release/*`.

## 4. Release Readiness
- Known limitations must be explicit in code and UX messages.
- No TODO placeholders in critical execution paths.
- Every new failure path has a deterministic user-facing message.
