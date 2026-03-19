# Studio Edit Text — Production Roadmap

## Objective
Bring `studio/edit text` to production-grade quality as a trustworthy PDF text editing feature that is:
- predictable for users
- measurable for the team
- safe in fallback behavior
- robust on real-world PDFs
- honest about semantic vs visual outcomes

---

## Current State Summary
The current implementation already has strong foundations:
- dedicated `/studio/edit` workflow
- inline text editing UX
- save / undo / redo
- batch save
- telemetry hooks
- advanced text formatting controls
- e2e coverage for save, telemetry, precision, advanced formatting, batch save, and pixel-diff flows

The main remaining gap is not basic UX, but **PDF-level correctness**:
- in some cases the app performs **true text replacement** in content streams
- in many real-world cases it falls back to **visual replacement** (overlay / whiteout + redraw)
- that means visual output may look correct while extracted/searchable text may still contain the original content

---

# Product Contract

## Required outcome categories
Formalize save outcomes into 3 explicit result types:

1. **true_replace**
   - underlying PDF text content is actually replaced
   - copy/paste, extraction, and search return the updated text

2. **visual_replace**
   - visual appearance is updated
   - underlying PDF text content may remain unchanged or partially unchanged

3. **unsupported**
   - document cannot be safely edited under current guarantees
   - system should avoid misleading success where outcome is low-confidence

## Why this matters
Without this contract, users may think “text was edited in PDF” while the system only changed visual appearance.
That is the main trust risk.

## Deliverables
- save-result enum shared across worker + UI + telemetry
- fallback reason taxonomy
- UX copy for each outcome mode
- internal engineering terminology alignment

---

# Phase 1 — Observability and Truthfulness

## Goal
Make the current system measurable before broadening capability.

## Work items
### 1.1 Add structured save-result telemetry
For every save, capture:
- `edit_mode = true_replace | visual_replace | unsupported`
- `fallback_reason`
- `file_id`
- `page_index`
- `language_guess`
- `text_span_count`
- `matched_operator_count`
- `single_text_element`
- `font_strategy`
- `pdf_complexity_bucket`

### 1.2 Add dashboard / reporting view
Track:
- % true replace
- % visual replace
- % unsupported
- top fallback reasons
- success rate by language
- success rate by PDF type
- ambiguity rate

### 1.3 Surface outcome internally in logs/debug
Add developer-visible save diagnostics so the team can inspect:
- which mode was used
- why fallback happened
- whether extracted-text correctness was expected

## Exit criteria
- team can quantify current true replace coverage
- top failure/fallback causes are visible
- no more guessing about “how often it really works”

---

# Phase 2 — Strengthen True Replace Engine

## Goal
Expand true replacement beyond the current narrow safe path.

## Current limitations
Current true replace is effectively limited to narrow cases such as:
- a single text element
- very constrained surrounding edit payload
- Latin-1 encodable text
- simple `Tj` / `TJ` operator matching

## Work items
### 2.1 Multi-operator matching
Support common real-world cases where one visible text span maps to:
- multiple adjacent `Tj` operators
- `TJ` arrays with kerning adjustments
- fragmented runs for a single visual word/line

### 2.2 Deterministic span-to-operator mapping
Strengthen matching using combined signals:
- bounding box overlap
- baseline alignment
- font size similarity
- extracted source text similarity
- reading order continuity
- neighbor context

### 2.3 Confidence scoring
Introduce confidence classes:
- high confidence → allow true replace
- medium confidence → fallback to visual replace
- low/ambiguous confidence → unsupported or safe fallback

### 2.4 Better ambiguity handling
Never silently choose a risky candidate when multiple operators are near-equivalent.
Prefer explicit fallback over incorrect replacement.

## Exit criteria
- true replace works on a materially wider class of born-digital PDFs
- ambiguous matches no longer risk unsafe replacement
- coverage improvement is visible in telemetry

---

# Phase 3 — Encoding, Fonts, and International Text

## Goal
Reduce fallback rates for non-Latin documents and font-heavy PDFs.

## Risks today
Current logic is constrained by:
- Latin-1 assumptions for in-stream replacement
- embedded font complexity
- shaping / encoding issues in multilingual documents

## Work items
### 3.1 Define font strategy matrix
Document and implement rules for:
- when original font can be reused
- when embedded fallback font is safe
- when visual fidelity is possible but semantic fidelity is not
- when system should refuse true replace

### 3.2 Language-specific validation tracks
Create dedicated support tracks for:
- Cyrillic
- Arabic
- CJK
- Devanagari

### 3.3 Explore Unicode-capable replacement paths
Where technically feasible, expand replacement support with:
- embedded font reuse
- encoding-aware replacement
- safer handling for subset fonts and ToUnicode mappings

### 3.4 Be conservative with shaped scripts
For scripts requiring shaping / bidi behavior, prefer correctness over broad claims.
If semantic replace is not safe, fallback should remain explicit.

## Exit criteria
- reduced fallback rate on multilingual born-digital PDFs
- known safe/unsafe cases documented
- international coverage is measurable, not anecdotal

---

# Phase 4 — Fallback as a First-Class Feature

## Goal
Treat visual replacement as an official mode, not a hidden compromise.

## Work items
### 4.1 Formal visual replace pipeline
Make fallback pipeline explicit and robust:
- whiteout/original suppression strategy
- redraw positioning fidelity
- sizing/alignment stability
- telemetry reason preservation

### 4.2 User-facing messaging
Add lightweight, non-alarming messaging options such as:
- “Text content updated”
- “Saved visually for this PDF”
- “Some PDFs support visual replacement only”

### 4.3 Internal/export diagnostics
Allow support and QA to inspect whether a file used:
- true replace
- visual replace
- unsupported path

## Exit criteria
- visual replacement is productized and understandable
- trust is preserved even when semantic replacement is unavailable

---

# Phase 5 — Test Infrastructure and Regression Corpus

## Goal
Ensure the feature is validated on real documents, not just demo PDFs.

## Work items
### 5.1 Build a golden PDF corpus
Create a representative corpus including:
- simple office-generated PDFs
- Adobe-generated PDFs
- Canva/Figma/exported PDFs
- multilingual documents
- embedded-font-heavy PDFs
- OCR-derived PDFs
- forms-heavy PDFs
- documents with fragmented text operators

### 5.2 Strengthen layered testing
#### Unit tests
Cover:
- content stream parsing
- operator matching
- confidence scoring
- fallback reason selection
- encoding gates

#### Integration tests
Validate:
- extracted text before/after save
- absence of duplicated legacy text where true replace is expected
- render stability
- fallback correctness

#### E2E tests
Validate user workflows for:
- single-line edit
- multi-edit scenarios
- save / undo / redo
- batch save
- true_replace vs visual_replace observable behavior

### 5.3 Dual validation for key fixtures
For important fixtures, always validate both:
- visual result
- extracted text correctness

## Exit criteria
- regressions are caught on realistic PDFs
- true replace correctness is tested semantically, not just visually
- fallback remains intentional and testable

---

# Phase 6 — UX Clarity and Expectation Management

## Goal
Align user expectations with what the engine can reliably do.

## Work items
### 6.1 Clarify edit model
Define what the feature is optimized for:
- line editing
- span editing
- block editing
- multi-line editing

Do not over-promise behavior not yet consistently supported.

### 6.2 Improve guidance for hard cases
Examples:
- scanned PDFs → suggest OCR first
- unsupported fonts → communicate visual replacement
- ambiguous mapping → suggest smaller text selection or another path

### 6.3 Review product copy
Audit in-product labels and public-facing copy so `Edit Text` does not imply guarantees the engine cannot yet make universally.

## Exit criteria
- lower mismatch between user expectation and saved result
- fewer trust-breaking surprises

---

# Recommended Delivery Sequence

## Sprint A — Truth and visibility
Focus:
- save result contract
- telemetry normalization
- debug visibility
- fallback taxonomy
- initial corpus setup

### Outcome
The team knows what is actually happening in production-like usage.

## Sprint B — Expand common-case true replace
Focus:
- multi-operator matching
- confidence score
- stronger deterministic mapping
- safer ambiguity handling

### Outcome
True replace coverage rises materially for common born-digital PDFs.

## Sprint C — Fonts and international support
Focus:
- Cyrillic first
- then Arabic / CJK / Devanagari tracks
- formal font strategy
- multilingual test coverage

### Outcome
Global PDF handling improves with measurable coverage.

## Sprint D — UX polish and product clarity
Focus:
- user messaging
- selection/edit model clarity
- hard-case guidance
- copy alignment

### Outcome
Feature becomes more trustworthy and easier to understand.

---

# Suggested Priorities

## P0
- define official result contract: `true_replace | visual_replace | unsupported`
- add full fallback telemetry and dashboarding
- build first golden PDF corpus
- expose save outcome in QA/debug flow

## P1
- implement multi-operator common-case true replace
- add confidence score and deterministic matching improvements
- strengthen extraction-based integration tests
- productize visual replace messaging

## P2
- improve multilingual replacement coverage
- refine edit model UX
- add richer guidance for OCR/scanned and hard-font cases

---

# Production Definition of Done
The feature should be considered production-grade when:

## Technical
- true replace works reliably on a majority of common born-digital PDFs
- ambiguous cases do not perform unsafe replacement
- fallback paths are intentional, measured, and stable
- duplicate old/new extracted text is rare and tracked

## Product
- users understand whether text content was truly updated or visually replaced
- messaging does not over-promise
- difficult cases fail safely and honestly

## Operational
- telemetry is actionable
- regression corpus exists and is maintained
- fallback reasons are visible and prioritized
- quality can be monitored over time

---

# Immediate Next 5 Actions
1. Introduce a shared save-result contract.
2. Add telemetry dashboard for fallback reasons and true-replace rate.
3. Build a regression corpus of real PDFs.
4. Expand true replace from single-operator cases to common multi-operator cases.
5. Add lightweight user-facing messaging for visual replacement.

---

# Notes
This roadmap intentionally prioritizes **truthfulness and observability first**.
That is the fastest path to a trustworthy feature and avoids spending time polishing behavior that may still be semantically unreliable on real PDFs.
