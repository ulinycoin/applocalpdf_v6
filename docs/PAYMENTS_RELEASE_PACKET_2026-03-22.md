# LocalPDF Payments Release Packet — 2026-03-22

## Summary

This release packet groups the work completed to prepare LocalPDF for a payment launch.

### Included workstreams
1. Billing restore hardening
2. Pricing/legal page updates
3. Footer/support updates
4. Launch documentation

---

## 1. Billing restore hardening

### Problem fixed
Monthly and yearly LemonSqueezy plans shared the same `product_id`, which made restore mapping risky when the old code matched monthly before yearly.

### Fix
- Restore mapping now prefers `variant_id`
- Product-level fallback is allowed only when it is unambiguous
- Ambiguous overlap returns `null` instead of silently misclassifying the license tier

### Files
- `api/billing/restore.ts`
- `api/billing/restore.test.ts`

### Validation
- Monthly mapping test added
- Yearly mapping test added
- Ambiguous overlap test added
- Full tests passing

---

## 2. Legal + billing pages

### Added / updated
- `website/src/pages/terms.astro`
- `website/src/pages/privacy.astro`
- `website/src/pages/refund-policy.astro`
- `website/src/pages/pricing.astro`
- `website/src/pages/faq.astro`

### What changed
- Terms now covers subscriptions, license keys, disclaimers, acceptable use, and liability boundaries
- Privacy now reflects billing, analytics, restore requests, and local-first positioning without unsafe absolute claims
- Refund Policy now exists as a standalone page
- Pricing now includes a legal/billing notice and support contact
- FAQ now includes billing/license/restore answers

---

## 3. Sitewide trust updates

### Footer
- Added `Refund Policy`
- Added `support@localpdf.online`

### Pricing copy
- Clarified monthly vs yearly billing wording
- Clarified automatic renewal wording
- Clarified support path

---

## 4. Documentation added or updated

### Added
- `docs/PAYMENTS_LAUNCH_CHECKLIST_2026-03-22.md`
- `docs/PAYMENTS_RELEASE_PACKET_2026-03-22.md`

### Updated
- `docs/PRODUCTION_RELEASE.md`

---

## 5. Build and validation status

### Passed
- `npm test`
- `npm run billing:preflight`
- `npm run build:web`

### Remaining launch-critical manual checks
- Production monthly checkout
- Production yearly checkout
- Production monthly restore
- Production yearly restore
- Free/pro limit enforcement on deployed host

---

## 6. Suggested commit title

```text
feat(billing): harden restore flow and add payments legal launch pack
```

## 7. Suggested commit body

```text
- prefer LemonSqueezy variant ids over overlapping product ids in restore mapping
- add restore mapping regression tests for monthly/yearly/ambiguous cases
- add Terms, Privacy, and Refund Policy pages for payments launch
- add billing/legal notice to pricing page and support contact in footer
- add payments launch checklist and release packet docs
```
