# Project Agent Rules

## Gemini Delegation Policy
- For routine tasks and development assistance, use `Gemini CLI` first.
- Typical delegated tasks: code search, dead-code audit, refactor suggestions, test idea generation, docs drafting, and repetitive scaffolding.
- Before applying delegated output, validate locally in this repo (TypeScript checks, tests, and targeted code review).
- Do not delegate destructive operations (deletions/resets) without explicit user confirmation.

## Execution Standard
- Prefer: delegate routine analysis to `Gemini CLI`, then implement and verify locally.
- Keep final responsibility in this repo: correctness, safety, and test pass status are mandatory.
