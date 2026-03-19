# Production Release

## Required environment

Copy `.env.example` into the deployment environment and set values explicitly.

- `VITE_BILLING_URL`
  - Billing or pricing destination used by the upsell overlay.
  - Default-safe value: `/pricing`
- `VITE_LS_STORE_ID`, `VITE_LS_PRODUCT_ID_PRO_SUB`, `VITE_LS_PRODUCT_ID_PRO_LIFETIME`
  - LemonSqueezy store and product IDs. Required for the `/pricing` checkout flow.
- `VITE_PUBLIC_JWT_KEY`
  - Public `RS256` key used to verify the subscription JWT on the frontend.
- `LEMON_SQUEEZY_API_KEY`, `JWT_PRIVATE_KEY`
  - Server-side only. Used by the `api/billing/restore.ts` Vercel function to validate licenses and sign JWTs.
- `VITE_V6_PAGE_COUNT_FALLBACK_MODE`
  - Accepted values: `off`, `limited`, `on`
  - Recommended value: `limited`

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
