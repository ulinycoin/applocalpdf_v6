# GEO Baseline — LocalPDF в AI-ответах

**Дата съёма:** 2026-08-01 (UTC)  
**Метод:** headed Chrome + Playwright  
**Сырьё:** `.agent/geo-baseline-raw.json`, `.agent/geo-baseline-summary.json`

## Ограничения съёма (честно)

| Движок | Статус | Примечание |
|--------|--------|------------|
| **Perplexity** | Частично | 4/7 полных ответа; 3/7 обрезаны signup wall после Sources |
| **Google AI Overview** | Полный | 7/7 |
| **Google AI Mode** (Gemini-backed Search) | Полный | 7/7; `gemini.google.com` app — login/hang в автоматизации |
| **ChatGPT** | Слабый | 1 полный ответ; остальные login/verification wall |

`gemini.google.com` и полный ChatGPT без логина **не сняты**. Для Gemini proxy = AI Mode + AI Overview.

---

## Запросы (7)

1. What is LocalPDF?
2. LocalPDF vs Smallpdf
3. best privacy-first PDF tools that work in the browser
4. PDF tools that don't upload files to a server
5. best free online PDF merge tool 2026
6. LocalPDF.online review
7. iLovePDF alternative that processes PDFs locally

---

## Матрица: упоминание localpdf.online / LocalPDF / конкуренты

Легенда: ✅ в ответе · ⚠ бренд без домена · ❌ нет · ⛔ нет ответа (wall)

| # | Query | Perplexity | AI Overview | AI Mode (Gemini) | ChatGPT |
|---|-------|------------|-------------|------------------|---------|
| 1 | What is LocalPDF? | ⚠ LocalPDF, без `.online` | ✅ + путаница с `local-pdf.com` | ⚠ LocalPDF generic | ⚠ + путаница с `local-pdf.com` / macOS app |
| 2 | LocalPDF vs Smallpdf | ⛔ thin (ссылка на Smallpdf) | ✅ корректный privacy contrast | ✅ canvas / $3.99 Pro | ⛔ verification |
| 3 | best privacy-first… | ⛔ signup wall | ❌ AI top: Webconex/PDFgear/Noll; LocalPDF только в organic | ✅ LocalPDF в top-5 | ⛔ login |
| 4 | don't upload… | ❌ PDF Mavericks, SwiftPDFLab | ❌ PDFgear/PDF24/LibreOffice; LocalPDF в organic | ⚠ LocalPDF в хвосте после ihatepdf/DumPDF/RaptorPDF | ⛔ login |
| 5 | best free merge 2026 | ❌ MiOffice, ToolPix, PDF24, iLovePDF, Smallpdf | ❌ PDF24, iLovePDF, Adobe | ❌ PDF24, GoPDFTools, Adobe, Jotform, iLovePDF | ⛔ login |
| 6 | LocalPDF.online review | ✅ домен + title | ✅ pricing Free/Pro $3.99 | ✅ но Textbook Splitter / AGPL / Docker — **шум чужих LocalPDF** | ⛔ thin |
| 7 | iLovePDF alt local | ❌ ihatepdf, RaptorPDF, BentoPDF | ❌ RaptorPDF, OneClickPDF, PDF24 | ❌ FileMint, RaptorPDF, PDF24, Stirling | ⛔ login |

---

## Ключевые цитаты (сжато)

### Brand queries — вас видят, но бренд размыт

**Perplexity / What is LocalPDF?**  
«privacy-first PDF toolkit… without uploading… WebAssembly/Canvas… free… no mandatory sign-in» — смысл верный, **домен `localpdf.online` не назван**.

**ChatGPT / What is LocalPDF?**  
«can refer to a few different projects… local-pdf.com, localpdf.app, or the macOS application» — **явная brand collision**.

**AI Overview / LocalPDF.online review**  
Верно: WebAssembly, zero uploads, Free 3 workspaces / 25 pages, Pro $3.99.  
Шум: «Textbook Splitter», «Deskew Studio» — атрибуты других LocalPDF-проектов, не V6.

### Category queries — вас почти нет

**AI Overview / privacy-first browser:** WebconexPDF, PDFgear Online, Noll Tools. LocalPDF не в AI top.

**Perplexity / no-upload:** PDF Mavericks, SwiftPDFLab. LocalPDF отсутствует.

**Perplexity + AI Overview + AI Mode / merge 2026:** PDF24 / iLovePDF / Adobe / MiOffice. LocalPDF = 0.

**iLovePDF local alt:** RaptorPDF, ihatepdf, OneClickPDF, FileMint, Stirling. LocalPDF = 0 в AI-ответах (иногда `local-pdf.com` в organic SERP).

### Comparison query — сильнее всего

**AI Mode / LocalPDF vs Smallpdf:** local vs upload, canvas, OCR, Free vs Pro **$3.99/mo** — близко к вашему позиционированию. Источник: ваши compare-страницы.

---

## Вердикт baseline

1. **Brand intent работает** (что такое / vs Smallpdf / review) — модели уже тянут privacy + browser + WASM.
2. **Category intent провален** (privacy-first / no-upload / merge / iLovePDF alt) — цитируют RaptorPDF, ihatepdf, PDF24, Noll, Webconex, FileMint.
3. **Главный риск — не «нас не видят LLM», а collision имени LocalPDF** (`local-pdf.com`, `localpdf.app`, Reddit «LocalPDF Studio», macOS app). Без канонического `localpdf.online` ответы смешивают чужие фичи (Textbook Splitter, AGPL, Docker).
4. ChatGPT в автоматизации почти бесполезен без логина — для следующего прохода нужен ручной съём из вашей сессии.

---

## Что измерять в следующем проходе (через 2–4 недели)

Те же 7 запросов × Perplexity / AI Mode / ChatGPT (logged-in).  
Метрики: (a) `localpdf.online` named, (b) в top-3 category lists, (c) нет чужих фич в описании вашего продукта.
