# LocalPDF Pricing Strategy — 2026-03-20

## Executive summary

LocalPDF should **not** try to win by being the cheapest generic PDF subscription. That market is crowded, price-transparent, and full of incumbents with large free surfaces (Smallpdf, iLovePDF, PDF24, Sejda, Adobe). Instead, LocalPDF should position itself as **the privacy-first, browser-native, local-processing PDF workspace** and monetize the features where users accept paying for certainty, speed, and power: **OCR, batch processing, premium export quality, document protection/redaction, and commercial/team workflows**.

### Core recommendation

Use a **hybrid freemium + subscription + usage-based overage** model:

- **Free**: generous core toolbox, local processing, watermark-free basic use, but with limits on advanced operations and monthly quotas.
- **Personal**: low-friction paid tier for solo users at **$4.99/month** or **$39/year**.
- **Pro**: power tier for frequent individual use at **$12.99/month** or **$99/year**.
- **Team**: collaboration/commercial tier at **$29.99/user/month** or **$24.99/user/month billed annually**, with minimum seat count and shared admin/billing features.
- **Credit add-ons / overages** for compute-expensive actions (especially OCR and future AI/document intelligence), with an anchor target of **$0.005–$0.015 per page** depending on the feature and volume.

### Why this is the best fit

1. **The market anchors “consumer PDF premium” around ~$5–$10/month.**
   - iLovePDF Premium: **€5/month billed annually**.
   - Sejda Monthly: **€8.50/month**.
   - Adobe Acrobat Standard/Pro: significantly higher at roughly **$14.99–$19.99/month**.
   - Smallpdf Pro sits in the same mainstream band, though exact live pricing is obscured on the fetched page.
2. **Free competitors are real**, especially PDF24, so LocalPDF cannot put the core promise (“basic PDF tools”) entirely behind a paywall.
3. **Privacy-first/local processing is valuable, but usually not enough as a standalone pricing axis** for mass consumers. It works best as a **conversion amplifier** on top of premium features and for certain niches: legal, HR, finance, healthcare-adjacent, education admin, freelancers handling contracts, and privacy-sensitive SMBs.
4. **Compute-heavy features should not be “unlimited” by default** if LocalPDF bears variable cost (OCR, AI extraction, advanced conversion, very large files, batch jobs).

### Recommendation in one sentence

**Give away the core local toolbox, charge for power + scale + compliance comfort, and reserve usage-based billing for the truly variable-cost features.**

---

## 1) Market landscape and competitive framing

LocalPDF sits in a market with four distinct pricing logics:

1. **Free / ad-supported / goodwill tools**
   - Example: PDF24
   - Strong for trust and word-of-mouth, weak for direct SaaS revenue.
2. **Consumer freemium subscriptions**
   - Examples: Smallpdf, iLovePDF, Sejda
   - Dominant model for web PDF utilities.
3. **Desktop / perpetual-license tools**
   - Example: UPDF and similar desktop-first products
   - Good fit for users who dislike subscriptions.
4. **Enterprise SDK / embedded pricing**
   - Example: Apryse SDK
   - Not a direct UX competitor, but useful as an anchor for how expensive document infrastructure can become at enterprise scale.

For LocalPDF, the closest strategic comparables are:

- **iLovePDF** — broad freemium PDF utility suite
- **Smallpdf** — polished premium PDF suite
- **Sejda** — smart free limits + lightweight paid upgrades
- **PDF24** — strong free/offline/privacy benchmark
- **Adobe Acrobat** — premium brand and upper pricing anchor
- **UPDF / Foxit-style products** — alternative pricing psychology around perpetual ownership and business tiers

---

## 2) Competitor comparison table

> Note: prices below reflect pages fetched on 2026-03-20. Some vendors localize currency, hide live prices behind JS, or run promotions. Where exact figures were obscured, the range is marked accordingly.

| Competitor | Free offer | Paid plans | Pricing signal | Local/offline/privacy angle | Strategic takeaway for LocalPDF |
|---|---|---|---|---|---|
| **Smallpdf** | 30+ tools, limited downloads/mobile access | Pro, Team, Business | Consumer premium in roughly **$9–$15/mo** band from search results; exact live page price obscured | Security/compliance messaging, but mostly cloud workflow | Strong UX benchmark. Good reminder that premium polish can support ~$10/mo, but generic cloud PDF tools are commoditized. |
| **iLovePDF** | Core tools, limited processing | Premium, Business | **€5/mo billed annually (€60/year)**; custom business pricing | Regional file processing, security/compliance messaging | Very important price anchor: broad suite at mass-market price. LocalPDF Personal must stay near or below this if positioned for individuals. |
| **PDF24** | Essentially free, no-restriction desktop/offline tools | No core paid desktop pricing visible; monetizes elsewhere | **Free** | Strong local/offline promise: files remain on PC | This is the hardest counterexample to “privacy alone should be paid.” Basic offline tooling must remain free enough to compete. |
| **Sejda** | Free with page/hour/file limits | Week Pass, Monthly, Annual | **€5.50 / 7 days**, **€8.50/mo**, **€71/year** | Distinguishes web/server processing from desktop/local processing | Useful model for constrained free usage and short-term passes. Good template for occasional-use monetization. |
| **Adobe Acrobat** | Free tools/trials, limited compared with paid | Standard, Pro, business bundles | Roughly **$14.99/mo Standard**, **$19.99/mo Pro** on annual commitment | Trust, brand, enterprise security more than “local-first” | Sets upper ceiling. LocalPDF can undercut heavily while still looking premium. |
| **Apryse PDF SDK** | Not consumer freemium | Custom licensing, enterprise/SaaS usage economics | Entry points from **~$1.5k**, enterprise much higher, custom quote | Infrastructure-grade, enterprise/compliance capable | Not a direct end-user competitor; useful to justify premium team/commercial pricing when LocalPDF saves firms from complex stack costs. |
| **UPDF** | Free with watermark, 2 conversions/day, limited OCR/batch | Subscription + perpetual license | Exact current page pricing not extracted, but explicitly supports **subscription + perpetual license** | Cross-platform app; free limitations push upgrades | Confirms that a one-time license option can work psychologically, especially for anti-subscription buyers. |

### Competitor notes

#### Smallpdf
- Fetched pricing page shows four plans: **Free, Pro, Team, Business**.
- Free includes 30+ tools but limited downloads/mobile access.
- Pro adds unlimited access, OCR, edit text, strong compression, AI tools.
- Team adds admin/billing/support features.

#### iLovePDF
- Very clear pricing architecture:
  - **Free**: limited processing
  - **Premium**: **€5/month billed annually, €60/year**
  - **Business**: contact sales
- Premium includes all tools, unlimited document processing, digital signatures, workflows, ad-free experience, regional file processing, and **2,000 AI credits**.
- This is the strongest proof-point that a low-cost paid tier can coexist with a broad free offering.

#### PDF24
- PDF24 Creator is free for private and commercial use.
- Explicitly markets **offline processing** and says files stay on the PC.
- Includes OCR and many tools for free.
- Implication: privacy-first alone is **not enough** to support a paywall. LocalPDF needs a sharper premium edge: browser-native ease, no install, better UX, better reliability, higher-quality output, faster workflows, and advanced functions.

#### Sejda
- Strong example of limits-based monetization:
  - Free: page/hour/file limits
  - Week Pass: **€5.50**
  - Monthly: **€8.50**
  - Annual: **€71**
- Also explicitly distinguishes server-side web processing from desktop local processing.
- Important lesson: short-duration access can monetize occasional but urgent jobs.

#### Adobe Acrobat
- Premium reference brand.
- Much higher pricing ceiling than utility tools.
- Adobe can charge for trust, ecosystem, and incumbency. LocalPDF should not mirror Adobe pricing too early.

#### Apryse SDK
- Enterprise document platform pricing is custom and expensive.
- This matters less for consumer plans, but it strengthens the case that **team/commercial LocalPDF plans can price for business value**, not just feature parity.

---

## 3) Will users pay for local processing and zero data transfer?

## Short answer

**Yes, but usually only as part of a broader value proposition.**

### Who will care enough to pay

Most likely to convert because of privacy/local-first:

- lawyers and legal ops
- HR / recruiters handling contracts and personal data
- finance/bookkeeping users
- procurement and sales ops working with quotes/contracts
- freelancers handling client-sensitive files
- SMBs with lightweight compliance anxiety but no full document stack
- privacy-conscious consumers dealing with IDs, tax docs, mortgage docs, medical paperwork

### Who will not pay for privacy alone

- students doing one-off merges or conversions
- casual users compressing a PDF once a month
- users already satisfied with free offline desktop tools like PDF24
- price-sensitive users who treat PDF tools as a commodity

### Practical conclusion

Privacy/local processing should be framed as:

- **Trust layer** (why LocalPDF is safer)
- **Conversion driver** (why choose LocalPDF over cloud upload tools)
- **Enterprise/team upsell lever** (policy, procurement, compliance comfort)

…but **not the only thing being sold**.

### What people actually pay for in this category

Users reliably pay for one or more of the following:

- removing hard limits and waiting friction
- OCR that actually works well
- bulk / batch operations
- premium conversions (Word/Excel/image fidelity)
- redaction / protection / password tools
- signatures / workflows / audit trail
- higher file size and page count limits
- multi-document processing
- commercial/team administration
- confidence and speed during urgent work moments

That means LocalPDF should monetize **privacy + power + convenience**, not privacy in isolation.

---

## 4) Monetization models to consider

## Model A — Freemium + paid tier (recommended foundation)

### Structure
- Free plan with generous basic tools and quotas
- Paid Personal / Pro tiers unlock premium features and/or higher limits

### Pros
- Familiar in this category
- Best for SEO/content-led acquisition
- Converts both casual and frequent users
- Lets privacy-first users try before they buy

### Cons
- Requires disciplined limit design
- Too generous = weak conversion
- Too restrictive = weak growth and bad word-of-mouth

### Expected economics (modeled)
These are benchmark-style estimates, not current LocalPDF observed data.

- Visitor → signup: **2%–6%**
- Signup → paid overall: **2%–8%**
- Anonymous visitor → paid: **0.1%–0.5%** initially; **0.5%–1.5%** with stronger intent traffic and mature funnel
- ARPU blended across all active users: **$0.20–$1.50/month** in early B2C freemium
- ARPPU (paid users only): **$5–$13/month** for individual-focused mix

### Complexity
**Low to medium**. Best first step.

---

## Model B — Tiered subscriptions (recommended)

### Structure
- Personal
- Pro
- Team

### Pros
- Easy to understand
- Supports different willingness-to-pay bands
- Straightforward billing implementation
- Good for annual discounts and upgrade ladders

### Cons
- Needs clear packaging logic
- Risk of too many overlapping features if not cleanly separated

### Expected economics (modeled)
- Personal take rate among paid users: **45%–65%**
- Pro take rate among paid users: **25%–45%**
- Team: **5%–15%** of revenue early, but potentially much higher later
- Blended paid ARPU: **$7–$15/month** depending on mix and annual share

### Complexity
**Low**. Strong choice.

---

## Model C — Credit-based usage pricing (recommended only for expensive workloads)

### Structure
Charge per page / per job / per OCR credit for variable-cost features.

### Pros
- Matches cost to usage
- Good for OCR and future AI/document intelligence
- Lets low-frequency users pay without full subscription
- Good monetization for API-like heavy users or agencies

### Cons
- Harder to explain to consumers
- Can create anxiety if core UX feels metered
- Poor fit if overused across too many features

### Expected economics (modeled)
- Useful add-on ARPU: **+$1–$6/month** for a subset of paid users
- Good occasional-use revenue from non-subscribers during urgent tasks

### Complexity
**Medium**. Worth doing only for selected workloads.

---

## Model D — One-time license / perpetual plan (optional, not first launch)

### Structure
- Lifetime or major-version license, maybe for desktop/PWA/offline bundle or “LocalPDF Forever” deal

### Pros
- Captures anti-subscription users
- Strong launch-promo / LTD / Black Friday psychology
- Easy marketing hook

### Cons
- Pulls demand forward
- Weak recurring revenue
- Can become toxic if support/compute costs persist
- Dangerous if OCR/AI costs are bundled “for life”

### Expected economics (modeled)
- Good campaign cashflow
- Weak long-term LTV unless heavily constrained

### Complexity
**Low billing complexity, high strategic risk**.

### Recommendation
Only offer perpetual pricing if it is **carefully scoped**:
- one-time unlock for non-variable local features only
- excludes heavy OCR/AI quotas or includes only small annual credits

---

## 5) Recommended pricing architecture for LocalPDF

## Positioning statement

**LocalPDF: the privacy-first PDF workspace that runs in your browser, keeps documents local by default, and charges only when you need pro-grade power or scale.**

## Recommended plan structure

### 1. Free — “Core LocalPDF”
**Price:** $0

**Goal:** acquisition, trust, SEO, habit formation

**Include:**
- Merge / split / reorder PDFs
- Compress (standard)
- Rotate, delete pages, extract pages
- Basic image ↔ PDF conversion
- Basic watermark or page numbering
- Basic protect/unlock if cheap to run locally
- Local processing by default
- No account required for light use

**Limits:**
- Monthly quota on advanced jobs
- File size / page count caps for large operations
- No batch processing beyond small count
- OCR trial quota only
- No advanced redaction
- No bulk export queue

**Suggested free limits:**
- Up to **3 advanced jobs/day** or **20 advanced jobs/month**
- OCR preview or **10 pages/month**
- Max **100 MB** per file on free
- Max **2 files** per batch job

**Why:**
The free plan must feel actually useful or SEO/top-of-funnel breaks. But it must stop short of replacing the paid tiers for work use.

---

### 2. Personal
**Price:** **$4.99/month** or **$39/year**

**Target:** individual users with recurring but light needs

**Include everything in Free, plus:**
- Higher size/page limits
- Unlimited standard tools
- OCR included up to a monthly quota (e.g. **500 pages/month**)
- Batch processing up to **20 files/job**
- Better conversion fidelity
- Password protect/unlock at scale
- Priority processing
- No ads / cleaner workspace
- Save presets/history

**Why this price works:**
- Close to iLovePDF’s €5 annualized entry point
- Still feels accessible
- Easy impulse purchase for a privacy-first value prop

**Expected role in mix:**
- Main starter paid tier
- Good for annual conversion

---

### 3. Pro
**Price:** **$12.99/month** or **$99/year**

**Target:** freelancers, consultants, recruiters, legal/ops users, heavy individuals

**Include everything in Personal, plus:**
- Large files (e.g. **up to 1 GB** if feasible)
- Higher OCR allowance (e.g. **3,000 pages/month**)
- Advanced OCR export modes
- Bulk/batch processing up to **100 files/job**
- Redaction tools
- Document protection / permissions presets
- Premium conversions / higher-fidelity layout retention
- Watch-folder / workflow presets if available later
- API or automation beta access (limited)
- Priority support

**Why this price works:**
- Below Adobe, above mass consumer utility tier
- Signals “serious work tool” without enterprise friction

**Expected role in mix:**
- Lower volume than Personal, but strong revenue contributor
- Best fit for privacy-sensitive professional use cases

---

### 4. Team
**Price:** **$29.99/user/month** monthly or **$24.99/user/month annual**, 3-seat minimum

**Target:** small teams and SMBs

**Include everything in Pro, plus:**
- Centralized billing
- Admin panel
- Seat management
- Shared usage pool / OCR credit pool
- Team presets / templates
- Regional processing controls if any server-side features exist
- SSO / audit logs / DPA / procurement support on higher quote tier

**Expansion path:**
- Team self-serve up to 20 seats
- Above that, move to sales-assisted custom pricing

**Why:**
Business buyers pay for control and assurance more than for raw PDF features.

---

## Add-on credits / overage pricing

Use credits **only** where cost scales materially.

### Best candidates
- OCR beyond included quota
- AI extraction/summarization/classification (future)
- Very large batch jobs
- premium server-side fallback processing if introduced

### Suggested overage structure
- **OCR overage:** **$0.005–$0.01/page**
- **Advanced AI/document intelligence:** **$0.01–$0.03/page equivalent**
- **Prepaid credit packs:**
  - 1,000 pages = **$7.99**
  - 5,000 pages = **$29.99**
  - 20,000 pages = **$99**

### Important rule
Do **not** meter basic local tools page-by-page. That would feel hostile and destroy the simplicity advantage.

---

## 6) Which features should be free vs paid

## Keep free
These are discoverability and adoption drivers.

- merge / split / reorder
- rotate / delete / extract pages
- simple compression
- simple convert to/from common formats
- simple protect/unlock if local cost is low
- browser-local processing promise
- basic editing where technically cheap

## Put behind paid tier or meaningful quota
These create real willingness to pay.

- OCR save/export
- batch processing at useful scale
- advanced compression profiles
- high-fidelity Office conversions
- redaction
- premium document protection / permissions
- workflow presets / automation
- multi-file and large-file processing
- team admin / billing / shared workspaces
- advanced support

## Good “aha” paywall moments
- “This batch job is ready — unlock bulk processing with Personal.”
- “OCR found text successfully — export full results with Personal/Pro.”
- “This document contains sensitive data — Pro includes secure redaction.”
- “Need to process 500 pages? Pro includes higher limits, or buy OCR credits.”

---

## 7) Conversion, ARPU, churn, and LTV model

> These are planning assumptions for decision-making, not observed LocalPDF metrics.

## Scenario assumptions

### Conservative scenario
- Visitor → signup: **2.5%**
- Signup → paid: **3%**
- Paid mix: 70% Personal / 25% Pro / 5% Team-equivalent seats
- Annual share: **35%**
- Monthly churn:
  - Personal: **7%–9%**
  - Pro: **5%–7%**
- Blended paid ARPU: **$6.50–$8.50**

### Base scenario
- Visitor → signup: **4%**
- Signup → paid: **5%**
- Paid mix: 55% Personal / 35% Pro / 10% Team revenue
- Annual share: **45%**
- Monthly churn:
  - Personal: **5%–7%**
  - Pro: **4%–5%**
- Blended paid ARPU: **$8.50–$11.50**

### Upside scenario
- Visitor → signup: **6%+**
- Signup → paid: **7%–9%**
- Strong intent traffic from SEO/tool pages + clear privacy positioning
- Annual share: **55%+**
- Monthly churn:
  - Personal: **4%–5%**
  - Pro: **3%–4%**
- Blended paid ARPU: **$10–$14+**

## Simple LTV heuristics
If gross margin is high and support burden is controlled:

- Personal LTV target: **$50–$120**
- Pro LTV target: **$120–$300**
- Team LTV target: **$300–$2,000+** depending on retention and seat expansion

### What matters most
For LocalPDF, **activation and intent-qualified conversion** will matter more than squeezing list price. In a commoditized category, users often pay because they hit a meaningful job, trust the tool, and want the friction removed immediately.

---

## 8) Recommended launch pricing grid

| Plan | Monthly | Annual | Best for | Core unlocks |
|---|---:|---:|---|---|
| Free | $0 | $0 | occasional users | core local PDF tools, limited advanced usage |
| Personal | **$4.99** | **$39** | recurring solo users | unlimited standard tools, useful OCR quota, small batch |
| Pro | **$12.99** | **$99** | power users/professionals | large files, high OCR quota, redaction, advanced batch/workflows |
| Team | **$29.99/user** | **$24.99/user/mo billed annually** | small teams/SMBs | admin, shared billing, pooled credits, team controls |

### Alternative launch grid if you want more aggressive acquisition
- Personal: **$3.99/month** or **$29/year**
- Pro: **$9.99/month** or **$79/year**
- Keep Team unchanged

This more aggressive version may improve early conversion but risks leaving money on the table if the product quality and privacy differentiation are strong.

### Alternative if you want stronger anti-subscription capture
Add:
- **LocalPDF Lifetime (limited scope): $79–$119 one-time**
- Includes: non-variable local features only
- Excludes or tightly caps: OCR credits, AI credits, enterprise support

I would treat this as a later promotional lever, not default pricing.

---

## 9) A/B testing plan

## Objectives
Validate:
1. Which entry price maximizes revenue, not just conversion
2. Whether privacy-first messaging lifts conversion enough to justify prominent positioning
3. Which features create the strongest paywall moment
4. Whether users prefer subscription-only or subscription + credit flexibility

## Test 1 — Personal price point
### Variants
- A: **$4.99/month**
- B: **$5.99/month**
- C: **$39/year** emphasis vs monthly emphasis

### Success metrics
- checkout conversion rate
- paid conversion per activated user
- 30-day retention
- refund rate
- net revenue per visitor (NRPV)

### Decision rule
Choose the variant with the best **revenue per activated user** and acceptable churn/refund profile, not necessarily highest checkout conversion.

---

## Test 2 — Privacy-led vs productivity-led messaging
### Variants
- A: “Your PDFs stay on your device. No upload by default.”
- B: “Fast browser PDF tools for serious work.”
- C: hybrid: “Private by default. Powerful when work gets real.”

### Success metrics
- homepage/tool-page signup conversion
- checkout conversion from feature gate
- scroll depth / CTA click-through
- paid conversion by acquisition source

### Hypothesis
Privacy-led messaging will outperform for sensitive-document use cases and some organic traffic, but the hybrid message may win overall.

---

## Test 3 — Feature gate timing
### Variants
- A: paywall before running OCR/batch
- B: allow result preview, gate export/save
- C: allow one successful free advanced use, gate second use

### Success metrics
- feature completion rate
- upgrade conversion after use
- rage exits / bounce
- support tickets

### Hypothesis
**Preview-then-pay** will outperform hard pre-gating for OCR and redaction.

---

## Test 4 — Subscription only vs subscription + credits
### Variants
- A: subscription only
- B: subscription + buy extra OCR credits
- C: no subscription required for one-off OCR pack purchase

### Success metrics
- one-off purchase conversion
- subscription cannibalization
- ARPU / ARPPU
- support confusion

### Hypothesis
Credit packs will help monetize occasional power users without materially hurting subscriptions if limited to expensive features.

---

## 10) Implementation plan

## Phase 1 — Pricing v1 (fastest path)
Launch:
- Free
- Personal
- Pro
- annual discounts
- feature gating for OCR, batch, redaction

**Needed:**
- plan entitlements model
- billing + subscription state
- feature flag/paywall UI
- usage counters for advanced jobs
- pricing page and upgrade modals
- event tracking for activation and conversion funnel

## Phase 2 — Metered overages
Add:
- OCR page credits
- prepaid credit packs
- overage notifications and soft caps

**Needed:**
- credit ledger
- per-feature usage accounting
- invoices/receipts clarity
- abuse controls

## Phase 3 — Team / business packaging
Add:
- seat management
- centralized billing
- shared quotas
- admin settings
- business landing page
- DPA / procurement artifacts

## Phase 4 — Optional perpetual / promotional license
Only if demanded by user feedback and channel economics.

---

## 11) Product and pricing principles for LocalPDF

1. **Free should solve the simple job completely.**
   If free feels fake, users leave before trust forms.
2. **Paid should remove friction, not invent it.**
   Monetize scale, quality, speed, and advanced capability.
3. **Privacy is a reason to choose; power is a reason to pay.**
4. **Use credit billing narrowly.**
   Meter expensive workloads, not the soul of the product.
5. **Keep pricing page dead simple.**
   Three public tiers beat five clever ones.
6. **Annual plan should be the default economic driver.**
   Target 30%–40% effective discount vs monthly.
7. **Team pricing should sell control and assurance.**
   Businesses rarely buy “merge PDF”; they buy reduced risk and reduced hassle.

---

## 12) Final recommendation

If LocalPDF launched pricing today, I would ship this:

### Public plans
- **Free** — core browser-local PDF toolkit
- **Personal** — **$4.99/month** or **$39/year**
- **Pro** — **$12.99/month** or **$99/year**
- **Team** — **$29.99/user/month** or **$24.99/user/month annual**, 3-seat minimum

### Paid-only / quota-gated features
- OCR export beyond a small trial
- batch processing at meaningful scale
- redaction
- advanced protection
- large files / high page counts
- premium conversion fidelity
- workflow presets / automation

### Metered extras
- OCR overage / credit packs at **$0.005–$0.01 per page**

### Testing priority
1. Personal price point
2. privacy message vs hybrid message
3. gate-after-preview vs hard gate
4. subscription-only vs credit add-ons

### Strategic bet
LocalPDF wins by being:
- more private than cloud-first tools,
- easier than desktop offline tools,
- cheaper and simpler than Acrobat,
- and more trustworthy for sensitive document work.

That combination supports a **mass-market entry tier around $4.99**, a healthy **Pro tier around $12.99**, and a **business tier around $25–$30/user/month** without trying to imitate enterprise document vendors.

---

## Sources

Official / primary sources accessed on 2026-03-20:

1. Smallpdf pricing page — https://smallpdf.com/pricing
2. iLovePDF pricing page — https://www.ilovepdf.com/pricing
3. PDF24 Creator page — https://tools.pdf24.org/en/creator
4. Sejda pricing / upgrade page — https://www.sejda.com/upgrade
5. Adobe Acrobat pricing page — https://www.adobe.com/acrobat/pricing.html
6. Apryse pricing page — https://apryse.com/pricing
7. UPDF pricing page — https://updf.com/pricing/

Supplementary search-grounded references used for directional ranges where some official pages obscured exact pricing:
- Smallpdf pricing search results / review directories surfaced via web search
- Adobe pricing search-grounded summary
- Apryse pricing guide / market references surfaced via web search

---

## Appendix — what to instrument from day 1

### Funnel events
- tool_page_view
- tool_run_started
- tool_run_completed
- paywall_seen
- paywall_cta_clicked
- checkout_started
- checkout_completed
- upgrade_success
- annual_selected

### Feature usage events
- merge_used
- compress_used
- convert_used
- ocr_started
- ocr_completed
- batch_job_started
- redaction_used
- protection_used

### Economic metrics
- visitor → signup conversion
- signup → activated conversion
- activated → paid conversion
- paid conversion by feature gate
- ARPU
- ARPPU
- churn (logo and revenue)
- expansion revenue
- refund rate
- LTV/CAC when acquisition channels mature
