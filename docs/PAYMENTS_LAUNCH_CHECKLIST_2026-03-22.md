# LocalPDF Payments Launch Checklist — 2026-03-22

## Status summary

Current state after fixes:
- Billing restore mapping updated to prefer `variant_id` over overlapping `product_id`
- Billing preflight passes
- Tests pass
- Legal baseline pages exist
- Pricing page includes billing/legal notice and support contact

This checklist is the final practical gate before enabling payments publicly.

---

## 1. Billing config gate

- [x] `VITE_BILLING_URL` is safe (`/pricing` or HTTPS URL)
- [x] Monthly checkout URL is set and HTTPS
- [x] Yearly checkout URL is set and HTTPS
- [x] JWT public/private keys match
- [x] LemonSqueezy API key is set
- [x] `PUBLIC_APP_URL` is set to production URL
- [x] Monthly/yearly product + variant allowlists are populated
- [x] Restore mapping prefers `variant_id`
- [ ] Optional: use distinct monthly/yearly `product_id` values to remove overlap warning entirely

---

## 2. Legal and trust gate

Required pages now present:
- [x] `/terms`
- [x] `/privacy`
- [x] `/refund-policy`
- [x] Footer links to legal pages
- [x] Support email visible: `support@localpdf.online`

Still worth confirming before public launch:
- [ ] Seller identity / business name is finalized and reflected on-site if needed
- [ ] Renewal wording matches actual LemonSqueezy subscription behavior
- [ ] Refund wording matches intended support policy in practice
- [ ] Analytics disclosure matches enabled tracking stack

---

## 3. Manual QA — must do before flipping payments on

### Pricing page
- [ ] `/pricing` loads in production
- [ ] Free plan text is correct
- [ ] Pro monthly text is correct
- [ ] Pro yearly text is correct
- [ ] Terms / Privacy / Refund Policy links work
- [ ] Support email link works

### Checkout flow
- [ ] Monthly button opens monthly LemonSqueezy checkout
- [ ] Yearly button opens yearly LemonSqueezy checkout
- [ ] Wrong plan cross-linking does not happen

### Restore flow
- [ ] Valid monthly license restores `pro_monthly`
- [ ] Valid yearly license restores `pro_yearly`
- [ ] Invalid license shows clean error
- [ ] Restored user lands in `/app`
- [ ] Stored token persists after reload

### Product enforcement
- [ ] Free user can create workspace #1, #2, #3
- [ ] Free user is blocked on workspace #4
- [ ] Free user can import a 25-page PDF
- [ ] Free user is blocked on a 26-page PDF
- [ ] Pro user is not blocked by workspace/page limits
- [ ] Pro badge / Pro state appears correctly after restore

---

## 4. Production ops gate

- [ ] Deploy from clean main branch state
- [ ] Re-run `npm run release:check:fast`
- [ ] Re-run `npm run billing:preflight` in production-like env
- [ ] Confirm `/api/billing/restore` works on deployed host
- [ ] Confirm analytics, if enabled, do not break pricing or restore flow
- [ ] Confirm no console errors on pricing page

---

## 5. Recommended post-launch monitoring

First 24–72 hours after enabling payments:
- [ ] Check successful checkout volume
- [ ] Check restore success/failure rates
- [ ] Check support inbox for billing confusion
- [ ] Check whether users confuse monthly vs yearly
- [ ] Check whether free-limit prompts are too aggressive
- [ ] Watch for chargebacks / duplicate purchase complaints

---

## 6. Launch verdict rule

Enable payments publicly only when:
- all billing config checks pass,
- manual monthly/yearly checkout + restore are verified,
- free/pro enforcement works as expected,
- and legal/trust pages are live in production.

If monthly/yearly restore has not been manually verified on the deployed host, do **not** call the rollout complete.
