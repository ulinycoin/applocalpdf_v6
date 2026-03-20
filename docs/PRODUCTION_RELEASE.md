# Production Release

## Required environment

Copy `.env.example` into the deployment environment and set values explicitly.

- `VITE_BILLING_URL`
  - Billing or pricing destination used by the upsell overlay.
  - Default-safe value: `/pricing`
- `VITE_LS_CHECKOUT_URL_PRO_MONTHLY`, `VITE_LS_CHECKOUT_URL_PRO_YEARLY`
  - Absolute LemonSqueezy checkout URLs used by the `/pricing` page.
  - Use full hosted checkout URLs from LemonSqueezy. Do not rebuild them in frontend code from hardcoded domains.
- `VITE_PUBLIC_JWT_KEY`
  - Public RSA key in PEM/SPKI format (`-----BEGIN PUBLIC KEY----- ... -----END PUBLIC KEY-----`).
  - This exact PEM is used by the frontend to verify the subscription JWT.
- `LEMON_SQUEEZY_API_KEY`, `JWT_PRIVATE_KEY`
  - Server-side only. Used by `api/billing/restore.ts` to validate licenses and sign JWTs.
  - `JWT_PRIVATE_KEY` must be the matching RSA private key in PEM format.
- `LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS`, `LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS`
  - Comma-separated allowlists for licenses that should map to `plan=pro`, `tier=pro_monthly`.
- `LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS`, `LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS`
  - Comma-separated allowlists for licenses that should map to `plan=pro`, `tier=pro_yearly`.
- `VITE_V6_PAGE_COUNT_FALLBACK_MODE`
  - Accepted values: `off`, `limited`, `on`
  - Recommended value: `limited`

## Billing contract

- Basic/free entitlements: `pdf.merge`, `pdf.split`, `pdf.compress`
- Pro entitlements add: `pdf.ocr`, `pdf.rotate`, `pdf.delete_pages`, `pdf.edit`, `pdf.to_image`, `office.convert`, `pdf.protect.encrypt`, `pdf.protect.unlock`
- Restore JWT claims now include: `iss`, `aud`, `sub`, `plan`, `tier`, `entitlements`, `iat`, `nbf`, `exp`
- Frontend accepts only `iss=localpdf-billing` and `aud=localpdf-v6`

## Restore endpoint expectations

- Endpoint: `POST /api/billing/restore`
- Input: `{ licenseKey }`
- Server validates the license with LemonSqueezy, maps it via env allowlists, signs RS256 JWT, and returns:
  - `token`
  - `plan`
  - `tier`
  - `expiresAt`
- Minimal abuse protection is enabled with in-memory rate limiting. For multi-instance production, move this limit to a shared edge/store layer.

## Release gate

Run the existing release checks before every production deploy:

```bash
npm run release:check
```

If you need a faster local preflight, use:

```bash
npm run release:check:fast
```

## Deploy expectations

- Deploy the generated `dist/` directory from a clean `main` checkout.
- Keep worker assets and regular assets under the same build root so Vite worker URLs resolve correctly.
- Do not bypass `UnifiedToolRunner`, VFS, or worker execution for production-only behavior.
