# Billing Migration Plan for V6

This document captures the plan for bringing the `v3` payment and subscription model into `v6` while keeping the v6 architecture intact.

## Scope

Move over the monetization contract, not the old architecture.

Keep:
- LemonSqueezy as the payment provider
- restore flow backed by a server endpoint
- JWT-based local subscription state
- runner-owned entitlement enforcement

Do not copy:
- legacy UI structure
- tool-layer subscription checks
- IndexedDB-backed storage inside app logic
- any platform-violating coupling

## Current contract

Frontend:
- `VITE_BILLING_URL`
- `VITE_LS_CHECKOUT_URL_PRO_MONTHLY`
- `VITE_LS_CHECKOUT_URL_PRO_YEARLY`
- `VITE_PUBLIC_JWT_KEY`

Server-side:
- `LEMON_SQUEEZY_API_KEY`
- `JWT_PRIVATE_KEY`
- `LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS`
- `LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS`
- `LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS`
- `LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS`

## Processing model

1. User opens the upgrade surface.
2. UI opens the checkout URL from env, without reconstructing provider URLs in code.
3. License restore submits the key to the backend endpoint.
4. Backend validates the license with LemonSqueezy.
5. Backend maps the trusted product/variant IDs through env allowlists.
6. Backend signs an `RS256` JWT.
7. Frontend verifies the JWT with the public PEM key and stores the result.
8. Runner consumes verified `plan` and `entitlements`.

The important rule remains: billing logic lives in platform/billing code, not in tool logic.

## Entitlements

Basic/free:
- `pdf.merge`
- `pdf.split`
- `pdf.compress`

Pro:
- everything in Basic
- `pdf.ocr`
- `pdf.rotate`
- `pdf.delete_pages`
- `pdf.edit`
- `pdf.to_image`
- `office.convert`
- `pdf.protect.encrypt`
- `pdf.protect.unlock`

## JWT contract

Public key format:
- PEM/SPKI only (`-----BEGIN PUBLIC KEY----- ... -----END PUBLIC KEY-----`)

Restore claims:
- `iss=localpdf-billing`
- `aud=localpdf-v6`
- `sub`
- `plan`
- `tier`
- `entitlements`
- `iat`
- `nbf`
- `exp`

Frontend validation rejects tokens with:
- wrong issuer / audience
- expired or not-yet-valid timestamps
- bad RS256 signature
- mismatched `plan`/`tier`
- unknown entitlements

## Restore endpoint notes

`POST /api/billing/restore`:
- accepts `licenseKey`
- validates it with LemonSqueezy
- maps the license only through env allowlists
- signs the JWT with `RS256`
- returns `token`, `plan`, `tier`, `expiresAt`
- includes minimal in-memory rate limiting for abuse protection

For horizontally scaled production, replace the in-memory limiter with a shared store or edge-native limiter.

## Acceptance criteria

The migration is complete when:
- `v6` exposes a working `/pricing` page
- billing keys are documented and consistent
- checkout uses env-provided absolute URLs
- restore flow returns a verified subscription state
- runner enforcement still owns limits and entitlements
- no billing logic leaks into tool logic or UI orchestration
