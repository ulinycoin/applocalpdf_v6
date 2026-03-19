# Billing Migration Plan for V6

This document captures the plan for bringing the `v3` payment and subscription model into `v6` using the same configuration keys and the same user-facing flow shape.

## Scope

Move over the monetization contract, not the old architecture.

Keep:
- LemonSqueezy as the payment provider
- the same env key names from `v3`
- pro + lifetime tier structure
- license restore flow

Do not copy:
- legacy UI structure
- tool-layer subscription checks
- IndexedDB-backed storage inside app logic
- any platform-violating coupling

## Keys to preserve from V3

Frontend:
- `VITE_LS_STORE_ID`
- `VITE_LS_PRODUCT_ID_PRO_SUB`
- `VITE_LS_PRODUCT_ID_PRO_LIFETIME`
- `VITE_PUBLIC_JWT_KEY`
- `VITE_PRODUCTION_URL`

Server-side:
- `LEMON_SQUEEZY_API_KEY`
- `JWT_PRIVATE_KEY`

Optional compatibility aliases already seen in `v3`:
- `VITE_LEMONSQUEEZY_STORE_ID`
- `VITE_LEMONSQUEEZY_MONTHLY_PRODUCT_ID`
- `VITE_LEMONSQUEEZY_LIFETIME_PRODUCT_ID`

## Processing Model from V3

The flow to preserve is:

1. User opens the upgrade surface.
2. UI loads the LemonSqueezy overlay script.
3. Checkout URL is built from store/product IDs.
4. Purchase opens via `window.LemonSqueezy.Url.Open(...)` when available.
5. License restore submits the key to a backend endpoint.
6. Backend validates the license with LemonSqueezy.
7. Backend signs a JWT with `RS256`.
8. Frontend verifies the JWT with the public key and stores the result.

The important rule is that the payment flow stays in platform/billing code, not in tool logic.

## Implementation Plan

### 1. Lock the configuration contract

Add the same billing env keys to `v6` and document them in:
- `.env.example`
- `docs/PRODUCTION_RELEASE.md`

Also define the expected defaults:
- billing destination defaults to `/pricing`
- production URL remains configurable
- public key is JWK JSON, not a private secret

### 2. Add a real pricing surface

`v6` already resolves upsell traffic to `/pricing`, so create a real marketing page for that route.

The page should include:
- Free
- Pro Monthly
- Lifetime
- restore / license recovery entry point

This page should be a normal marketing route, not an app tool route.

### 3. Restore checkout handling

Reintroduce the billing helper layer that:
- resolves the billing destination
- opens an absolute checkout URL in a new tab
- otherwise navigates internally

Keep the helper small and deterministic.

### 4. Restore license exchange on the backend

Add a server endpoint that:
- accepts `licenseKey`
- validates it with LemonSqueezy
- infers tier from the trusted response
- signs a JWT with `RS256`
- returns `token`, `tier`, and `expiresAt`

If a restore endpoint is needed, add rate limiting at the endpoint boundary.

### 5. Wire subscription state into the platform

The platform should consume verified subscription state and pass it into the runner context.

Required states:
- `free`
- `pro`
- `lifetime`

The runner remains the enforcement point for entitlement and quota decisions.

### 6. Keep storage responsibility in platform code

If token persistence is needed, keep it inside a platform storage layer.

Do not:
- write token logic into plugin UI
- move billing state into tool logic
- use direct file or blob lifecycles for this path

### 7. Add tests around behavior

Test the contract, not the provider SDK.

Minimum coverage:
- billing destination resolution
- checkout URL construction
- restore endpoint success and failure paths
- JWT verification
- runner denial when entitlements are missing

## Recommended File Targets

Likely areas to touch:
- `src/app/react/billing.ts`
- `src/app/react/ux-feedback-overlay.tsx`
- `src/app/react/billing.test.ts`
- `website/src/pages/pricing.astro`
- `docs/PRODUCTION_RELEASE.md`
- `.env.example`

Backend storage or auth code should be added only where the current `v6` deployment model expects serverless handlers or platform services.

## Acceptance Criteria

The migration is complete when:
- `v6` exposes a working `/pricing` page
- billing keys are documented and consistent
- LemonSqueezy checkout opens from the upsell path
- restore flow returns a verified subscription state
- runner enforcement still owns limits and entitlements
- no billing logic leaks into tool logic or UI orchestration

