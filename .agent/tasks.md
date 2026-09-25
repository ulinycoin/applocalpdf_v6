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

## P1 — видимость ядра (sales-plan §3) — выполнено 2026-09-25

| # | Задача | Статус | Что сделано |
|---|--------|--------|-------------|
| 1 | Кнопка Merge | [x] | Новая секция PAGES в рейле: Merge / Split / Delete. Merge переносит выбранные страницы (или всё активное пространство) в другое; при >1 соседе показывает список пространств |
| 2 | Drop-таргет | [x] | При перетаскивании страницы на другое пространство появляется подсказка «Release to merge into <имя>» (`PageObject.tsx`), hit-test вынесен в `findDocumentUnderPointer()` |
| 3 | Split | [x] | Выбранные страницы (или всё пространство) выносятся в новое пространство рядом с исходным, вьюпорт подстраивается |
| 4 | Delete | [x] | `Delete`/`Backspace` в canvas-шелле + кнопка Delete в рейле |
| 5 | События | [x] | `studio_merge_completed` (method `button`/`drag`), `studio_split_completed`, `studio_delete_pages` — контракт + `posthog-sink.ts` + тесты (`studio-page-ops.test.ts`, `posthog-sink.test.ts`). Попутно починен пропущенный маппинг `STUDIO_EMPTY_STATE_CTA` → `studio_empty_state_cta` (событие трекалось с Level 1, но в PostHog не уходило) |
| 6 | Копирайт пустого состояния | [x] | На `pointer: coarse` вместо «⌘O / drag & drop» — «Select pages, then use Merge, Split or Delete in the toolbar»; на десктопе добавлена подсказка про перенос страниц между пространствами |
| — | Приёмка | [x] | `npm test` 319 pass / 0 fail, `npm run build`, `npm run audit:workerization:strict` |

Общая логика операций вынесена в `src/v6/components/Studio/studio-page-ops.ts` — один путь для рейла, клавиатуры и drag, с телеметрией и чекпоинтом истории в каждом. Пространство, у которого не осталось страниц, удаляется, если оно не создано вручную (`allowEmpty`).

## Ждёт фаундера или данных

- [ ] **Дашборд LemonSqueezy:** выключить месячный вариант `1442622` (P0-2, кода не требует)
- [ ] **Deploy + первая покупка $19:** LS отдаёт 6 ордеров, последний `2026-06-29`, lifetime — 0. Проверить restore Pro по license key (tier `pro_lifetime`) не на чем
- [ ] **Гейт A (+2 недели после P1):** merge ≥ 100/нед, ненулевые split/delete. Считать по `studio_merge_completed` / `studio_split_completed` / `studio_delete_pages` в PostHog. База до P1: событий не существовало
- [ ] **Проверить первые события руками (1 минута):** автоматический браузер для этого не годится — PostHog JS отбрасывает трафик веб-драйвера (в прогоне Playwright SDK загружался, `__loaded=true`, но ни одного POST на `/ingest/e`; GA4 при этом отправлял). Нужно открыть `/app`, нажать «Upload PDF» или перетащить страницу в другое пространство и посмотреть Activity в PostHog: `studio_empty_state_cta`, `studio_merge_completed`
- [ ] **Гейт B (+4 недели):** активация `app_tool_run_started` / `/app*` ≥ 25% (с 14.8%), checkout opens ≥ 15/мес (с 8). База 7 дней до P1: `paywall_shown` 116 → `paywall_cta_clicked` 1 → `checkout_opened` 2
- [ ] LLM probe retest web-enabled (Q1/Q3/TECH) — после деплоя
- [ ] OCR UX: оценки времени и чанки уже в коде (ebc40fa), но за 14 дней всё ещё 3 × `Worker timeout exceeded` + 1 × `Setting up fake worker failed`
- [ ] Share: ciphertext уходит на `tmpfiles.org` (~1 час жизни файла), а главная держит «0 bytes uploaded» — уточнить формулировку и решить про свой storage
- [ ] Protect/Compress на зашифрованном PDF: сообщение уже человеческое (raw pdf-lib убран), но за 14 дней 3+3 события — нет пути «Unlock → Protect» в один клик
- [ ] Найдено в P1: `commitDocs()` в `store/document-store.ts` считает отфильтрованный список пространств и выбрасывает его (`documents: nextDocs` без фильтра) — пустые пространства, освобождённые перетаскиванием, остаются на канвасе. Кнопочные операции обходят это через `pruneEmptiedWorkspaces()`, но жест — нет

## P2 — вход из поиска (sales-plan §3) — начато 2026-09-25

| # | Задача | Статус | Что сделано |
|---|--------|--------|-------------|
| 1 | SEO → canvas + инструмент | [x] | Все 8 страниц ведут в canvas (`/app/studio?upload=1[&tool=<id>]`). Инструмент открывается сам, как только файл загружен: ocr-pdf / compress-pdf / auto-toc — панели и workspace внутри canvas, edit/sign — canvas-редактор (`tool=text` / `sign`), merge/split/convert — сам canvas (это действия и секция рейла, предвыбирать нечего). Возврат на канвас — кнопка «Back to Canvas» (переименована из «Back to Studio» в convert-workspace) |
| 2 | `?upload=1` + `?tool=` | [x] | canvas понимает оба параметра: подсвечивает загрузку и вооружает инструмент; в мастере `?upload=1` тоже поддержан (`SmartUploadZone.autoOpen`) |
| 3 | Старые deep links | [x] | `/app/<инструмент>` больше не показывает «Studio-first» тупик: инструмент с canvas-поверхностью перенаправляется в `/studio?tool=<id>&upload=1`, остальные оставляют понятный экран с кнопкой «Go to Studio». Standalone-мастер оставлен только для word-to-pdf/excel-to-pdf (там конверсия по своей природе не canvas-задача) |
| 4 | Тест-страж | [x] | `src/app/routing/seo-app-targets.test.ts`: каждая страница обязана вести в `/studio`, каждый вооружённый инструмент — существовать в canvas-рейле (`shared/canvas-tools.ts`), карта сайта не должна расходиться с `shared/` |
| 7 | Найдено при проверке | [x] | Инструмент запускался **трижды** на одну загрузку: эффект зависел от `handleToolClick`, чья identity меняется на каждом рендере, а сброс состояния не успевал примениться — счётчик free-лимита сразу показывал 3 из 3 и вылетал пейвол. Заменено на синхронный ref-гвард: теперь одна загрузка = один запуск (`localpdf_usage_text` = 1) |
| 5 | Мобильный прогон | [ ] | `manifest` + `share_target`, e2e 390×844 — не сделано |
| 6 | Деплой deep links | [x] | **Найдено на проде:** Vercel не применяет rewrite `/app/:path*` — `/app/merge-pdf`, `/app/compress-pdf`, `/app/auto-toc`, `/app/word-to-pdf` и даже `/app/foo-bar` отдавали 404 (`x-vercel-error: NOT_FOUND`), а 200 отвечали только 5 путей, для которых `build-vercel.mjs` клал физический `index.html`. Теперь fallback-файлы генерируются для всех инструментов-плагинов (минус скрытые), список берётся из каталогов `src/plugins/` |

### Найдено и исправлено в P2: `?upload=1` никогда не открывал файловый пикер
- Chrome: «File chooser dialog can only be shown with a user activation». После загрузки нового документа transient activation нет (`navigator.userActivation.isActive === false`), поэтому программный `input.click()` блокируется — и в мастере, и в canvas (там это было с самого появления параметра). CTA «Upload PDF — it stays on your device» вёл на экран, где ничего не открывалось.
- Теперь при `?upload=1` без активации: в мастере зона подсвечивается, получает фокус и текст «Choose your PDF to continue / Click here or press Enter»; в canvas пульсируют кнопка Upload в рейле и кнопка в пустом состоянии. Если активация есть (переход внутри SPA) — пикер по-прежнему открывается сам.
- Проверено в браузере: standalone-merge проходит весь путь upload (2 файла) → config → Run Merge → result (2 страницы) → download.

## Free-лимит: 3 файла в сутки (запрос фаундера 2026-09-25)

| # | Задача | Статус | Что сделано |
|---|--------|--------|-------------|
| 1 | Единая квота | [x] | `src/app/platform/daily-file-quota.ts`: два счётчика на сегодня — `processed` и `downloaded`, лимит 3 у каждого, только для плана `basic`, хранение в localStorage (`localpdf_daily_files`), сброс по дате. Тесты: `daily-file-quota.test.ts` (5 кейсов, включая переход через сутки и отсутствие localStorage) |
| 2 | Обработка (все точки входа) | [x] | Проверка до записи файлов, списание после успешной: canvas `handleIncomingFiles`, мастер `wizard-flow-core.handleFilesAdded`, страница OCR `handlePickFiles`. Batch больше остатка отклоняется целиком с сообщением |
| 3 | Скачивание (все точки) | [x] | `download-output-files.ts`, экспорт из canvas (`studio-top-nav`), скачивания convert-workspace (`downloadResults`, `downloadSingleResult`), ZIP компресса, панель Auto-TOC. Пейвол с текстом «Free includes 3 downloads per day…» |
| 4 | Старые лимиты убраны | [x] | Удалён `daily-usage.ts` и поштучные «3/день на инструмент» (Text, Sign, Whiteout, Protect, Auto-TOC и т.д.) — заменены единой файловой квотой. Также убран мёртвый `setPaywallReason` в этой ветке |
| 5 | Копирайт сайта | [x] | `pricing.astro` (schema, FAQ, список фич — число берётся из `FREE_DAILY_FILE_LIMIT`), `index.astro`, две compare-страницы, `pdf-tools-without-upload.astro`, `llm.txt` ×2, `index-ai.md` — free описан как «3 workspaces, 3 files per day (upload and download)» |
| 6 | Проверка в браузере | [x] | canvas: 3 файла приняты, 4-й → пейвол; convert-workspace: 3 скачивания, 4-е → пейвол; страница OCR: 3 файла, 4-й → оверлей пейвола |
| 7 | $0.99 «безлимит на сутки» | [ ] | **Рекомендация: не сейчас.** Комиссия LS 5% + $0.50 → с $0.99 остаётся ≈$0.44 (44% против ≈92% с $19). Продаж нет 88 дней, 2 открытия чекаута за неделю; узкое место — не отсутствие дешёвого тарифа. Плюс третий оффер усложняет замер гейтов A/B. Вернуться после гейта B, уже с цифрой «сколько людей упёрлось в 3 файла/день» |
| 8 | Google Pay / PayPal | [ ] | Кода не требует: это методы чекаут-страницы LemonSqueezy (наш Merchant of Record). Их собственные доки перечисляют cards, PayPal, Apple Pay; сторонний обзор добавляет Google Pay, Alipay, WeChat Pay, Cash App Pay, ACH — доступность зависит от устройства и региона. Проверить в дашборде LS → Store → Payments/Checkout |

## Ждёт фаундера или данных

- [ ] **Решение по лимиту страниц (вопрос фаундера 25.09): не включать сейчас.** Данные против: (1) в реальных документах, которые упирались в 5-страничный лимит Auto-TOC, **9 из 14 были больше 25 страниц** (491, 548, 457, 410, 303, 126, 57, 39, 32) — лимит 25 отсекал бы большинство; (2) мастер уже разрешает free-пользователю 100–300 страниц на файл (`merge-pdf` 200, `split-pdf` 200, `encrypt-pdf` 300, `extract-images` 100), то есть canvas-лимит 25 был бы в 8 раз строже соседнего экрана; (3) единственная работающая стена (3 workspace) даёт 55 чел./мес и 0 покупок — количество стен не является ограничением; (4) включение сейчас испортит замер активации гейта B (14.8% → 25%). Включается тремя строками в `plan-limits.ts` в любой момент — текст пейвола пересчитается сам
- [ ] **Несогласованность, которую стоит решить:** Auto-TOC (заявлен как free-инструмент, `featureTier: 'basic'`) жёстко блокирует документы >5 страниц — самая строгая стена в продукте, строже, чем лимиты Pro-инструментов
- [ ] P3 (только после гейтов): убрать лимиты 3/день в Studio
- [ ] P1-follow-up (не сделано намеренно): плавающее меню по-прежнему знает только CMP — Merge/Split/Delete живут в рейле и на клавиатуре

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
