# SEO Sprint 3 Map

This map records the current canonical money pages and the intents they absorb so future SEO work stays consistent with the existing redirect policy.

| Keyword cluster | Canonical page | Redirect aliases / absorbed intents | Supporting articles |
| --- | --- | --- | --- |
| Edit PDF | `/features/edit-pdf` | `/add-text-pdf`, `/rotate-pdf`, `/watermark-pdf`, add text to pdf, rotate pdf, watermark pdf, lightweight overlays | `/blog/edit-text-in-pdf-guide`, `/blog/pdf-security-best-practices`, `/blog/add-watermark-to-pdf`, `/blog/create-fillable-pdf-forms-guide` |
| Merge PDF | `/features/merge-pdf` | `/merge-pdf`, merge pdf files, combine pdf files, reorder merged packet, merge scans | `/blog/how-to-merge-pdf-files`, `/blog/smart-merge-ai-pdf-sorting`, `/blog/compress-pdf-without-losing-quality` |
| OCR PDF | `/features/ocr-pdf` | `/ocr-pdf`, ocr pdf, scanned pdf to text, extract text from scanned pdf, searchable scanned document | `/blog/ocr-pdf-extract-text`, `/blog/pdf-security-best-practices`, `/blog/edit-text-in-pdf-guide` |
| Compress PDF | `/features/compress-pdf` | `/compress-pdf`, compress pdf, reduce pdf size, optimize bulky scan, email-size pdf | `/blog/compress-pdf-without-losing-quality`, `/blog/how-to-merge-pdf-files`, `/blog/pdf-security-best-practices` |
| Split PDF | `/features/split-pdf` | `/split-pdf`, `/extract-pages-pdf`, `/delete-pages-pdf`, split pdf by range, extract pages, separate packet pages | `/blog/how-to-split-pdf-files`, `/blog/smart-organize-ai-page-analysis` |
| Sign PDF | `/features/sign-pdf` | `/sign-pdf`, sign pdf, electronic signature on pdf, approval signature workflow | `/blog/how-to-sign-pdf-digitally`, `/blog/pdf-security-best-practices` |
| Convert PDF | `/features/convert-pdf` | `/pdf-to-word`, `/word-to-pdf`, `/images-to-pdf`, `/pdf-to-images`, pdf to word, word to pdf, image conversion workflows | `/blog/convert-word-pdf-guide`, `/blog/convert-pdf-to-images-guide`, `/blog/ocr-pdf-extract-text` |
| Security / trust | `/security` | `/protect-pdf`, `/unlock-pdf`, protect pdf, unlock pdf, sensitive pdf handling | `/blog/pdf-security-best-practices`, `/blog/how-to-sign-pdf-digitally` |

Notes:
- Canonical pages and aliases reflect the current route strategy in `vercel.json` and the legacy archive handling in `website/src/pages/[legacy].astro`.
- Supporting articles are intentionally selective. Additions should only happen when the article materially supports the cluster intent.
