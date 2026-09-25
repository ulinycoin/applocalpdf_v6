# Active Tasks

Last updated: 2026-09-25

## P0 — гигиена (sales-plan §3) — выполнено 2026-09-25

| # | Задача | Статус | Что сделано |
|---|--------|--------|-------------|
| 0 | Зафиксировать план | [x] | `.agent/sales-plan-2026-09-25.md` + 3 файла geo-baseline теперь в git (aa2c0c6) — раньше жили вне истории |
| 1 | «25 pages» vs `maxPagesPerDocument: Infinity` | [x] | Решение: лимит **не** включаем до гейтов A/B (он добавил бы трение в окно замера активации, гейт B). Убрано обещание: 9 строк на сайте и в AI-файлах; в коде текст пейвола считает `freePageLimitMessage()` в `plan-limits.ts` (9 вызовов, 5 файлов), поэтому при включении лимита текст пересчитается сам. Приёмка: `grep -r "25 pages" website/src src` пуст |
| 2 | LS monthly variant `1442622` | [~] | Код чист — UI и ссылок нет. Вариант всё ещё `published`; у LemonSqueezy API нет метода обновления варианта (только object/retrieve/list) → только дашборд. Данные: 4 из 10 `checkout_opened` за 30 дней — `variant=monthly` |
| 3 | `download-moment-upsell` | [x] | Модуль удалён, 5 точек подключения (studio-top-nav, result-stage, `AutoTocStudioPanel`, `StudioConvertWorkspace`, v6 `WizardShell`) скачивают напрямую. 78% всех пейвол-показов и 0 покупок за всю жизнь больше не искажают сигнал |
| 4 | `demoContext {plan:'pro'}` | [x] | `ocr-pdf-test-page.tsx` использует `runtime.billing.getContext()` — free-пользователь видит реальный пейвол |
| 5 | Мёртвый код | [x] | Удалены `monthlyQuota` и `usageThisMonthByTool` (contracts, `unified-tool-runner`, `split-pdf/definition.ts`), а также вся папка `src/app/react/wizard/` (шелл + 3 stage-файла — ноль импортов, продублированы в `v6/components/Wizard/`) |
| — | Приёмка | [x] | `npm test`, `npm run build`, `npm run audit:workerization:strict`, `npm run billing:preflight` |
| — | Гигиена репо | [x] | `.gitignore`: `.cursor/`, `.cursorrules`, `.hermes/`, `.mimocode/`, `test/fixtures/pdfs/debug/` |

## Ждёт фаундера или данных

- [ ] **Дашборд LemonSqueezy:** выключить месячный вариант `1442622` (P0-2, кода не требует)
- [ ] **Deploy + первая покупка $19:** LS отдаёт 6 ордеров, последний `2026-06-29`, lifetime — 0. Проверить restore Pro по license key (tier `pro_lifetime`) не на чем
- [ ] **Гейт по lifetime:** 7 дней после запуска — 2 открытия чекаута, 0 покупок; за 30 дней lifetime 2 / yearly 4 / monthly 4. Свежие 7 дней: `paywall_shown` 116 → `paywall_cta_clicked` 1 → `checkout_opened` 2. Узкое место — клик по CTA (0.86%), не чекаут → следующий шаг P1 (видимость ядра), а не правки пейвола
- [ ] LLM probe retest web-enabled (Q1/Q3/TECH) — после деплоя
- [ ] OCR UX: оценки времени и чанки уже в коде (ebc40fa), но за 14 дней всё ещё 3 × `Worker timeout exceeded` + 1 × `Setting up fake worker failed`
- [ ] Share: ciphertext уходит на `tmpfiles.org` (~1 час жизни файла), а главная держит «0 bytes uploaded» — уточнить формулировку и решить про свой storage
- [ ] Protect/Compress на зашифрованном PDF: сообщение уже человеческое (raw pdf-lib убран), но за 14 дней 3+3 события — нет пути «Unlock → Protect» в один клик

## P1/P2 (sales-plan, ждут гейтов A/B)

- [ ] P1: кнопка Merge в рейле (13 кнопок, ни одной merge/split/delete), drop-таргет «объединить», Split и Delete кнопками, события `studio_merge_completed` / `studio_split_completed` / `studio_delete_pages`
- [ ] P2: per-page `appHash` в `website/src/data/featurePages.ts` (сейчас все 8 — `'studio'`), `?upload=1` в v6 `WizardShell`, мобильный прогон 390×844
- [ ] P3 (только после гейтов): включить `maxPagesPerDocument: 25` в `plan-limits.ts` (текст пейвола пересчитается сам), убрать лимиты 3/день в Studio

## Future candidates (не начато)

| # | Задача | Приоритет | Заметка |
|---|--------|-----------|---------|
| 8 | SEO-статьи под OCR-запросы | Medium | Контент под органик-интент |
| 9 | Show HN / Product Hunt | Low | Аудитория подходящая (20 визитов с одного упоминания) |
| 11 | Email capture | Low | Нурчурить free-пользователей |
| 14 | PDF/A конвертер (Pro) | [ ] | Ghostscript → PDF/A-1b → VeraPDF, server opt-in |
| 15b | SEO `/features/verify-pdf-redaction` | [ ] | После появления `REDACT_CERT_*` в PostHog |

## Закрыто ранее (2026-06…09)

- [x] Security: `/api/download-proxy` — allowlist `tmpfiles.org` + тест (2c3afcd)
- [x] Monetization: webhook маппит `pro_lifetime` → `purchase_completed` (ea22f53)
- [x] Billing: `restore.ts` отдаёт полный entitlement-набор + parity-тест
- [x] Tests: `npm test` включает `api/**/*.test.ts`
- [x] Оффер: месячная подписка выведена, якорь — годовая $39.99; lifetime $19 живой (LS 1371816 / variant 2143549)
- [x] AI crawler markdown fork `/localpdf`, live curl matrix, disambiguation page
- [x] GEO baseline (`.agent/geo-baseline-2026-08-01.md`) + LLM brand probe baseline
- [x] Level 1/2 (пустой стейт, upsell→checkout, OCR-превью, OCR-триал, JA/ZH лендинги, Auto-TOC) — детали в `CLAUDE.md` §8 и `done.md`

## Status legend

- `[ ]` — not started
- `[~]` — in progress / partially
- `[x]` — done
- `[!]` — blocked
