# LocalPDF Tariff Implementation Plan — 2026-03-20

## Executive summary

This document defines the implementation plan for the new LocalPDF pricing model:

- **Free**
  - up to **3 workspaces** in Studio
  - up to **25 pages per document**
- **Pro**
  - full functionality
  - unlimited workspaces
  - unlimited pages
- **Pricing**
  - **$3.99 / month**
  - **$39.99 / year**

The project already has a solid billing foundation:
- LemonSqueezy restore flow
- JWT-based local billing state
- `basic` / `pro` plan model
- entitlement enforcement at runner level

What is **not** implemented yet is the product-level enforcement for Studio usage limits:
- workspace count limit
- page count per document limit
- unified upgrade UX for these limits

This plan focuses on shipping the new tariff model without overengineering and without breaking the existing billing architecture.

---

## 1. Product decision to implement

## Public plan structure

### Free
- max **3 workspaces**
- max **25 pages per document**
- basic/local-first usage
- no access to Pro-only features

### Pro
- **all features unlocked**
- unlimited workspaces
- unlimited pages

### Billing options
- **Pro Monthly** — $3.99/month
- **Pro Yearly** — $39.99/year

### Explicit non-goals for this phase
- no Team plan
- no credit-based billing
- no overage model
- no lifetime license
- no partial feature bundles

---

## 2. Current project state

## Billing and pricing infrastructure already present

### Already implemented
- `src/app/platform/billing-contract.ts`
- `src/app/platform/billing-service.ts`
- `api/billing/restore.ts`
- `website/src/pages/pricing.astro`
- JWT verification in frontend
- LemonSqueezy license restore endpoint
- plan + entitlement consumption in runner execution path

### Current mismatch vs target plan
Current code still reflects an older tariff structure:
- `basic`
- `pro_monthly`
- `pro_lifetime`

Current pricing page also reflects old pricing and old packaging.

### Studio/product-level gap
The current system can restrict tools by entitlement, but does **not** yet restrict:
- number of Studio workspaces
- document page count inside Studio

This means the billing layer exists, but the actual Free-vs-Pro Studio policy is not yet enforced.

---

## 3. Implementation principles

1. **Do not overload entitlements with usage limits.**
   - Entitlements answer: “Can this user access this tool?”
   - Plan limits answer: “How much Studio usage is allowed?”
   - These should remain separate.

2. **Keep tariff logic centralized.**
   - Avoid scattering `if basic and pages > 25` checks across many components.
   - Introduce a dedicated limits contract and shared guard functions.

3. **Enforce limits at the product boundary, not only in marketing UI.**
   - Blocking only on the pricing page or only on one button is insufficient.
   - Studio import and document-creation flows must enforce the new plan.

4. **Prefer simple and explicit UX over hidden truncation.**
   - If a document exceeds 25 pages on Free, block it with a clear upgrade prompt.
   - Do not silently trim pages.

5. **Ship the simple model first.**
   - Free / Pro only
   - Monthly / Yearly only
   - no credit packs, no per-feature metering

---

## 4. Target architecture

## 4.1 Billing contract

Continue using:
- `plan`: `basic | pro`
- `tier`: `free | pro_monthly | pro_yearly`

Remove:
- `pro_lifetime`

## 4.2 New plan limits contract

Introduce a dedicated module, for example:

- `src/app/platform/plan-limits.ts`

This module should define the non-entitlement product limits for each plan.

### Proposed shape

```ts
export interface PlanLimits {
  maxWorkspaces: number | typeof Infinity;
  maxPagesPerDocument: number | typeof Infinity;
}
```

### Proposed values

#### Basic / Free
- `maxWorkspaces = 3`
- `maxPagesPerDocument = 25`

#### Pro
- `maxWorkspaces = Infinity`
- `maxPagesPerDocument = Infinity`

## 4.3 Shared limit guards

Introduce helper functions, for example:

- `getPlanLimits(plan)`
- `canCreateWorkspace(context, currentWorkspaceCount)`
- `canUseDocumentWithPageCount(context, pageCount)`
- `canAddDocumentToStudio(context, currentWorkspaceCount, pageCount)`

These guards should return structured results, not just booleans, so the UI can explain why the action was blocked.

### Example return shape

```ts
interface LimitCheckResult {
  allowed: boolean;
  reason?: 'workspace_limit' | 'page_limit';
  limit?: number;
  current?: number;
}
```

---

## 5. Scope by implementation area

## 5.1 Billing model cleanup

### Goal
Make the billing model match the new commercial offer:
- Free
- Pro Monthly
- Pro Yearly

### Files to update
- `src/app/platform/billing-contract.ts`
- `src/app/platform/billing-service.ts`
- `src/app/platform/billing-service.test.ts`
- `api/billing/restore.ts`
- `.env.example`
- `docs/BILLING_MIGRATION_PLAN_V6.md`
- `docs/PRODUCTION_RELEASE.md`

### Required changes
1. Replace `pro_lifetime` with `pro_yearly`
2. Update tier normalization logic
3. Update restore endpoint license mapping
4. Update env naming to reflect monthly/yearly plan IDs
5. Update tests to assert the new tier contract

### Recommended env names
- `VITE_LS_CHECKOUT_URL_PRO_MONTHLY`
- `VITE_LS_CHECKOUT_URL_PRO_YEARLY`
- `LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS`
- `LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS`
- `LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS`
- `LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS`

---

## 5.2 Pricing page refresh

### Goal
Replace the current pricing page with the new 2-plan offer.

### Files to update
- `website/src/pages/pricing.astro`
- optionally any related tests / snapshots if present

### Target content

#### Free
- 3 workspaces
- up to 25 pages per document
- essential PDF tools
- local-first processing

#### Pro
- unlimited workspaces
- unlimited pages
- OCR
- editing
- conversion
- protect/unlock
- full Studio access

#### Prices
- `$3.99/month`
- `$39.99/year`

### Remove
- lifetime plan card
- lifetime restore language if it implies a public offer
- outdated `$9/month` and `$59/once` copy

### UX recommendation
Use one featured Pro card with both billing options visible, instead of two separate product cards if possible.

---

## 5.3 Studio workspace-limit enforcement

### Goal
Prevent Free users from creating more than 3 Studio workspaces.

### Primary file
- `src/app/react/studio-top-nav.tsx`

### Current behavior
`handleCreateSpace()` creates a new workspace without plan checks.

### New behavior
Before creating a workspace:
1. read billing context from `runtime.billing.getContext()`
2. resolve plan limits
3. count current workspaces
4. if count >= 3 and plan is Free:
   - block creation
   - show upgrade prompt
   - optionally route to `/pricing`

### Definition of workspace
At this phase, a workspace should be treated as any Studio document in `documents[]`, including empty ones.

### Why this definition
It avoids simple bypasses such as creating unlimited empty workspaces.

### UX copy recommendation
- “Free includes up to 3 workspaces. Upgrade to Pro for unlimited workspaces.”

---

## 5.4 Studio page-limit enforcement on import

### Goal
Prevent Free users from opening documents larger than 25 pages.

### Primary file
- `src/v6/components/Studio/StudioShell.tsx`

### Current behavior
During `handleIncomingFiles()` the app:
- loads the PDF
- gets `numPages`
- builds page thumbnails
- adds the resulting document to Studio

### New behavior
After `numPages` is known and before the document is added:
1. read billing context
2. resolve plan limits
3. if Free and `numPages > 25`:
   - do not add the document
   - show upgrade prompt / toast
   - track the event

### Product rule
Block the document entirely. Do not truncate to 25 pages.

### Why
- avoids silent data loss
- keeps behavior understandable
- matches premium gating expectations better

### UX copy recommendation
- “Free supports documents up to 25 pages. Upgrade to Pro to open larger PDFs.”

---

## 5.5 Guarding secondary document-creation paths

### Goal
Avoid easy bypasses where Free users can still end up with >25-page documents or exceed workspace count indirectly.

### Risky paths to review
- tool results inserted back into Studio
- merge outputs
- convert outputs
- protect/unlock result documents
- copy/paste and rearrangement flows
- any action that creates a new `StudioDocument`

### Files to review
- `src/v6/components/Studio/StudioShell.tsx`
- `src/v6/components/Studio/StudioFloatingMenu.tsx`
- `src/v6/components/Studio/convert/use-studio-convert-controller.ts`
- `src/v6/components/Studio/edit/use-studio-edit-controller.ts`
- `src/v6/components/Studio/store/document-store.ts`

### Policy recommendation
The rule should be:

> A Free user cannot create, import, or receive a Studio document over 25 pages, and cannot exceed 3 Studio workspaces, regardless of how the document was produced.

This is stricter than checking import only, but much more reliable.

### Suggested enforcement strategy
Centralize checks before any new `StudioDocument` enters the store.

If introducing a full store-level policy hook is too much for this phase, enforce at all known document entry points and list remaining gaps explicitly.

---

## 5.6 Upgrade UX / paywall surface

### Goal
Provide a consistent path from a blocked action to Pro purchase.

### Existing utilities
- `src/app/react/billing.ts`
  - `openBillingPlans(...)`
  - `openCheckout(...)`

### Recommended implementation
Create a lightweight reusable upgrade surface, for example:
- `src/app/react/upgrade-modal.tsx`
- or a slimmer banner/toast + CTA first

### Reasons it should support
- `workspace_limit`
- `page_limit`

### CTA behavior
Prefer:
- open `/pricing`
- or open a direct checkout if you want a shorter path

### Minimal first version
A toast or alert is acceptable for v1 if it is wired to a clear upgrade CTA.

### Better version
A small modal with:
- title
- short reason-specific copy
- “Upgrade to Pro” button
- “Maybe later” close button

---

## 5.7 Telemetry and measurement

### Goal
Measure whether the tariff limits create upgrades or just abandonment.

### Events to add
- `PAYWALL_SHOWN`
  - reason: `workspace_limit | page_limit`
  - plan
  - currentWorkspaceCount
  - pageCount
- `UPGRADE_CTA_CLICKED`
  - reason
- `CHECKOUT_OPENED`
  - source surface
- `UPGRADE_RESTORE_SUCCESS`
- `UPGRADE_RESTORE_FAILED`

### Why this matters
The 25-page limit is plausible but aggressive. We need data on:
- how often users hit it
- whether they upgrade
- whether they leave instead

### Metrics to watch post-launch
- upgrade CTR from paywall
- restore success rate
- blocked import rate
- blocked workspace creation rate
- checkout start rate
- conversion to Pro

---

## 6. Detailed implementation phases

## Phase 1 — Billing contract realignment

### Deliverables
- `pro_lifetime` removed
- `pro_yearly` added
- restore endpoint updated
- env/docs updated
- tests updated

### Acceptance criteria
- restore flow works for monthly and yearly licenses
- frontend accepts and stores both tiers
- no references remain to lifetime as a public tariff

---

## Phase 2 — Introduce plan limits module

### Deliverables
- new limits contract file
- shared guard functions
- unit tests for limits and guards

### Acceptance criteria
- `basic` resolves to 3 workspaces / 25 pages
- `pro` resolves to unlimited
- guard helpers return structured reasons

---

## Phase 3 — Enforce workspace limit in Studio UI

### Deliverables
- workspace creation blocked at 3 for Free
- upgrade CTA shown
- telemetry event emitted

### Acceptance criteria
- Free user can create 3 workspaces
- creating a 4th workspace is blocked
- Pro user is not blocked

---

## Phase 4 — Enforce page limit on document import

### Deliverables
- import blocked above 25 pages for Free
- upgrade CTA shown
- telemetry event emitted

### Acceptance criteria
- Free user can import 25-page PDF
- Free user cannot import 26-page PDF
- Pro user can import larger PDFs

---

## Phase 5 — Cover secondary document-entry paths

### Deliverables
- review and patch all major Studio document creation paths
- ensure Free users cannot bypass limits through outputs/results

### Acceptance criteria
- merge/convert/protect flows do not bypass tariff limits
- no known easy path exists to create >25-page document on Free
- no known easy path exists to exceed 3 workspaces on Free

---

## Phase 6 — Pricing page refresh

### Deliverables
- new 2-plan pricing page
- monthly/yearly checkout CTA
- no lifetime public offer remaining

### Acceptance criteria
- pricing copy matches actual product rules
- checkout env names match code
- pricing page is production-ready

---

## Phase 7 — QA / release prep

### Deliverables
- test coverage
- updated docs
- release validation checklist

### Acceptance criteria
- release checks pass
- no contradictory pricing copy remains
- upgrade prompts work end-to-end

---

## 7. File-by-file implementation checklist

## Billing / contract
- [ ] `src/app/platform/billing-contract.ts`
- [ ] `src/app/platform/billing-service.ts`
- [ ] `src/app/platform/billing-service.test.ts`
- [ ] `api/billing/restore.ts`
- [ ] `.env.example`
- [ ] `docs/BILLING_MIGRATION_PLAN_V6.md`
- [ ] `docs/PRODUCTION_RELEASE.md`

## New limits layer
- [ ] `src/app/platform/plan-limits.ts` (new)
- [ ] `src/app/platform/plan-limits.test.ts` (new)

## Studio enforcement
- [ ] `src/app/react/studio-top-nav.tsx`
- [ ] `src/v6/components/Studio/StudioShell.tsx`
- [ ] `src/v6/components/Studio/StudioFloatingMenu.tsx` (review)
- [ ] `src/v6/components/Studio/convert/use-studio-convert-controller.ts` (review)
- [ ] `src/v6/components/Studio/edit/use-studio-edit-controller.ts` (review)
- [ ] `src/v6/components/Studio/store/document-store.ts` (review / optional enforcement)

## Upgrade UX
- [ ] `src/app/react/billing.ts`
- [ ] `src/app/react/upgrade-modal.tsx` or equivalent new component

## Marketing/pricing
- [ ] `website/src/pages/pricing.astro`

## QA / release
- [ ] release docs updated
- [ ] tests passing
- [ ] manual validation notes captured

---

## 8. Test plan

## Unit tests

### Billing contract
- `normalizeTier()` accepts `free`, `pro_monthly`, `pro_yearly`
- `pro_lifetime` is no longer accepted
- default entitlements remain correct

### Plan limits
- basic resolves to `{3, 25}`
- pro resolves to unlimited

### Guard functions
- Free can create 0/1/2/3? -> allow only until count < 3
- Free blocked at 3 existing workspaces when creating another
- Free allowed at 25 pages
- Free blocked at 26 pages
- Pro always allowed

## Integration tests
- Free: create workspace #1, #2, #3 → allowed
- Free: create workspace #4 → blocked
- Free: import 25-page PDF → allowed
- Free: import 26-page PDF → blocked
- Pro: import large PDF → allowed
- Pro: create unlimited workspaces → allowed
- restore endpoint returns valid monthly tier
- restore endpoint returns valid yearly tier
- pricing page shows only Free + Pro

## Manual QA checklist
- hit workspace limit and verify CTA
- hit page limit and verify CTA
- verify checkout buttons open correct plans
- restore Pro and confirm limits disappear
- verify no stale lifetime mentions remain

---

## 9. Risks and mitigation

## Risk 1 — Limits only enforced in UI
If checks are added only to one button or one import flow, users may still bypass them via secondary flows.

### Mitigation
- central guard helpers
- review all document-entry paths
- add tests for tool-result reinsertion into Studio

## Risk 2 — Pricing copy diverges from real product behavior
Marketing may say “full functionality” while product still blocks something unexpectedly.

### Mitigation
- update pricing only after actual enforcement logic is in place
- run manual QA against the pricing claims

## Risk 3 — 25-page limit is too aggressive
The Free plan may block too many users before they perceive value.

### Mitigation
- instrument paywall events
- measure blocked imports vs upgrades
- be ready to raise to 40 or 50 pages if drop-off is too high

## Risk 4 — Lifetime assumptions remain in restore/docs/env
Even after the pricing page is updated, code/docs/env may still refer to lifetime plans.

### Mitigation
- remove or rename all lifetime-related env variables
- grep the repo after implementation

---

## 10. Release acceptance criteria

The tariff implementation is complete when all of the following are true:

1. The public pricing page shows only:
   - Free
   - Pro Monthly ($3.99)
   - Pro Yearly ($39.99)
2. Free users cannot create more than 3 workspaces.
3. Free users cannot import or create Studio documents above 25 pages.
4. Pro users have no workspace/page limits.
5. Monthly and yearly restore flows issue valid Pro JWTs.
6. No lifetime pricing remains in the public offer.
7. Upgrade prompts route correctly to pricing/checkout.
8. Telemetry is in place for paywall hits and upgrade CTA clicks.
9. Release checks pass.

---

## 11. Recommended execution order

### Step 1
Billing contract cleanup:
- remove lifetime
- add yearly
- update restore/docs/env/tests

### Step 2
Create `plan-limits.ts` and guard helpers.

### Step 3
Implement workspace-limit enforcement in `studio-top-nav.tsx`.

### Step 4
Implement page-limit enforcement in `StudioShell.tsx`.

### Step 5
Patch secondary document-entry paths and add telemetry.

### Step 6
Refresh pricing page and checkout wiring.

### Step 7
Run QA, fix edge cases, ship.

---

## 12. Final recommendation

This should be implemented as a **small but strict pricing v1**, not as a flexible billing platform.

The right delivery shape is:
- simple 2-plan offer
- strict Free limits
- centralized guard logic
- clear upgrade path
- measurement from day 1

That gives LocalPDF a monetization system that is:
- understandable,
- realistic to ship,
- aligned with the current codebase,
- and easy to iterate later if the 25-page or 3-workspace thresholds need adjustment.
