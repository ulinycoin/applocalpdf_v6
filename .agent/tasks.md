# Active Tasks

Last updated: 2026-09-30

## Деньги: первая lifetime-продажа и три невидимых потока (2026-09-30)

Факт продажи (LS API): order 9614552 / №2850867, 30.09 14:46:43 UTC, product 1371816 «LocalPDF Pro», variant 2143549, **$19.00 + $2.47 HST = $21.47**, покупатель Tarana Steinke `tarana@bbtherapy.ca` (CA), live mode. Комиссия LS `app_fee` $1.91 → net **$17.09**. Лицензия `850B857C-…` выдана 14:46:45, activation_limit 3. Путь: /pricing 14:44 → чекаут 14:44:18 → оплата 14:46:43 → /app 14:47:38 (инструменты, save 14:50). Ключ прогнан через прод `POST /api/billing/restore` → `{success:true, tier:'pro_lifetime'}`, 12 entitlements.

| # | Задача | Статус | Что сделано |
|---|--------|--------|-------------|
| 1 | Продажа не попала в PostHog | [x] | Причина: прод до 16:09:48 UTC 30.09 крутил сборку без маппинга lifetime (фикс `ea22f53` от 24.09 19:30); вебхук отвечал `200 {ignored:true, reason:'unmapped_product'}`, LS считал доставку успешной и не ретраил. Проверено живым подписанным вебхуком: сейчас отдаёт `tier: pro_lifetime`. Событие дозалито бэкфиллом (`source: backfill_manual`, `backfilled: true`, реальный timestamp 14:46:45, distinct_id сессии покупателя) |
| 2 | Продления подписки не попадали в аналитику | [x] | `subscription_payment_success` приходит как объект инвойса: нет `product_id`/`variant_id`/`first_order_item`, только `subscription_id` → `mapProductVariantToTier('','')` → null → `ignored:true`. Добавлена ветка `resolveRenewalTier()` (LS `/v1/subscriptions/{id}`, фолбэк-тир `pro_subscription`) + 2 теста на инвойс-фикстуру. Дозалито 5 продлений ($23.67). Выручка за всё время: $17.88 (первые monthly) + $23.67 (продления) + $21.47 (lifetime) = **$63.02 gross** против $36.88, которые считались в плане |
| 3 | Активация лицензий в LS не работала by design | [x] | Приложение никогда не вызывало `/v1/licenses/activate` (только `validate`), поэтому у всех ключей было `inactive` и 0 из 3 девайсов — включая живого подписчика с июня. Теперь `restore` активирует устройство (`instance_name` = «LocalPDF · Chrome on macOS · <device id>»), матчит существующий инстанс по имени (повторная активация не тратит слот), отдаёт 409 `activation_limit_reached` при 3/3, кладёт `ins`/`lki` в JWT; `refresh` их переносит; новые `api/billing/devices.ts` (список) и `api/billing/deactivate.ts` (освобождение слота) + кнопка Devices у Pro в навбаре |
| — | Приёмка | [x] | `npm test` 345 pass / 0 fail, `npm run build` (tsc + vite), `npm run audit:workerization:strict` exit 0, `npm run billing:preflight` (1 warning про overlap product ids 917519 — ожидаемый) |

Не сделано и риски:
- **Деплой не выполнялся** — изменения в рабочем дереве. Пока не задеплоено, активации в LS не появятся, а `billing_device_*` события не полетят.
- Уже выданные JWT не несут `ins`: устройство подписчика и покупателя lifetime в LS не зарегистрировано, пока они не нажмут Activate заново (слот при этом не сгорит — сработает матч по имени устройства).
- Настоящего отзыва доступа при деактивации нет: lifetime-JWT живёт 10 лет, поэтому освобождение слота не выбивает устройство из Pro до истечения токена.
- `featureTier: 'pro'` стоит только у `pdf-editor`; protect/unlock/convert/ocr помечены `basic` — за $19 гейтится почти ничего.

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
- [x] **Deploy + первая покупка $19:** состоялась 30.09 — order 9614552, lifetime, $21.47 gross / $17.09 net; restore по реальному ключу покупателя проверен в проде (`tier: pro_lifetime`). Раньше здесь стояло «lifetime — 0»
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
- [x] **Deploy + первая покупка $19:** состоялась 30.09 — order 9614552, lifetime, $21.47 gross / $17.09 net; restore по реальному ключу покупателя проверен в проде (`tier: pro_lifetime`). Раньше здесь стояло «lifetime — 0»
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

## Мобильный слой (sales-plan §2.6) — выполнено 2026-09-26

Замер до правок: живой dev-сервер, iPhone 13 (390×664, DPR 3), Playwright. База из sales-plan §1: mobile 390 польз. (16%), активация 10.6% против 14.8% в целом, ошибок 15.8%, 52 показа пейвола → 0 кликов.

| # | Задача | Статус | Что сделано |
|---|--------|--------|-------------|
| 1 | Канвас на всю ширину | [x] | Рейл (52px, 13% экрана) скрыт на ≤760px; `canvasDimensions` больше не вычитает `STUDIO_TOOL_RAIL_WIDTH`; канвас 338 → 390px |
| 2 | Инструменты доступны | [x] | `StudioToolSheet` — шторка с подписанными строками 52px; список вынесен в общий `StudioToolList`, поэтому мобильный и десктопный наборы не расходятся. Кнопка «Tools» (только при `hasFiles`). До этого: 19 кнопок 51×32 без подписей (`:hover`/`:focus-within` на тач не срабатывает), 2 инструмента ниже сгиба (scrollHeight 746 против 615), а после тапа рейл залипал раскрытым на 220px (56% экрана) |
| 3 | Тап-таргеты 44px | [x] | Замер до: 32 интерактивных элемента < 44px (нав 25–27px, нижняя панель 28px/шрифт 12px). После: 0 на canvas-экранах (остался 20×20 checkbox внутри строки 44px). Нижняя панель 52px + `env(safe-area-inset-bottom)`; Copy/Paste/сетка помечены `studio-viewport-desktop-only`; `opacity: 0` у закрытия воркспейса убран (на тач было недостижимо) |
| 4 | dvh + safe-area | [x] | `viewport-fit=cover`, `height: 100dvh` на shell и шторке, `env(safe-area-inset-*)` на наве, нижней панели, шторке, шапке редактора. До: `height: 100%` (панель уезжала под тулбар iOS Safari) и 1 упоминание safe-area на весь CSS |
| 5 | Зум пинчем | [x] | `touchstart/move/end` на контейнере Konva: два пальца — масштаб вокруг центра, состояние коммитится на `touchend`. Проверено через CDP `Input.dispatchTouchEvent`: 154% → 385%. До: только `onWheel` и кнопки ±, на телефоне зума не было |
| 6 | Стартовый зум | [x] | На мобильных документ кладётся в одну колонку (`layoutGridColumns = 1`, `StudioDocument.gridColumnsOverride`) и фитится по ширине: 45% → 154% |
| 7 | Редактор в оверлее | [x] | Шапка в две строки (было: имя файла выдавливало «+», 1:1 и fit за правый край); тулбар — одна скроллируемая строка 65px вместо 3 строк на 144px (23% экрана); `stageHeight` считается от видимой области, а не от неотмасштабированной страницы (было 882px при странице на 47% → ~250px пустоты над документом); отступ fit-to-width 48px → 16px при контейнере < 520px |
| 8 | PWA | [x] | `public/app-manifest.json` со `start_url: /app/studio`, `scope: /app/`, `display: standalone` + shortcuts (Studio / `?upload=1`), `<link rel=manifest>` и apple-touch-icon в `index.html`. До: манифест был только у сайта, с `start_url: /` — установленное приложение открывало маркетинг, а не инструмент |
| 9 | Панель настроек инструмента | [x] | **Найдено фаундером на 469×453.** Панель схлопывалась в **0px** высоты: `@media (max-width: 900px)` задавал `grid-template-rows: auto minmax(0,1fr)` на 2 строки, а детей трое — третий уходил в неявную `auto`-строку (~287px), а `minmax(0,1fr)` доставался панели настроек и обнулялся. Раскладка переведена на flex-column (2 или 3 ребёнка работают одинаково), панель `flex: 0 1 auto` + `max-height: 38dvh` уступает место канвасу, у канваса пол `min-height: 180px`. Замер после: 390×664 — панель 199px / канвас 299px; 469×453 — панель 107px (скроллится) / канвас 180px; десктоп 1440×900 не изменился (`88px 340px 1012px`) |
| 10 | Тач-размеры контролов | [x] | Вынесены в отдельный `@media (max-width: 900px), (pointer: coarse)`: сегменты/инпуты/кнопки панелей редактора 26–30px → 44px, свотчи цвета 22–30px → 36px, чекбоксы 13px → 20px внутри строк 44px, контролы мастера (`cvt-*`, `wz-btn`) 25–39px → 44px. Отдельный брейкпоинт нужен, чтобы iPad 768px получил одноколоночную раскладку **и** тач-размеры, а десктоп с мышью — ни то, ни другое |
| 11 | Панель настроек — шторка | [~] | **Первая версия была оверлеем и сломала работу с документом — см. п.13.** Итог: панель в потоке снизу + сворачивание. На ≤760px она не делит область жёстко и не перекрывает канвас: `order: 2`, `flex: 0 1 auto`, `max-height: 45dvh`, канвас `order: 1`, `min-height: 160px`, у тела `padding-bottom: 64px` под фиксированную кнопку сохранения (панель и основное действие не пересекаются никогда). Ручка 52px с грипом, названием инструмента и шевроном сворачивает панель до 53px — канвас вырастает с ~240 до ~380px. Состояние сбрасывается при смене инструмента. На десктопе ручка `display: none`, тело `display: contents` — box-model рейла не изменился |
| 12 | Остальные контролы панелей | [x] | `select` 30px → 44px, кнопки B/I 30×30 → 44×44, свотчи 36 → 44px, превью цвета 28 → 36px, строки-переключатели 20 → 44px, чекбоксы панели 14 → 20px. Проверено на всех 7 инструментах редактора: в панели 0 элементов < 40px, ошибок в консоли нет |
| — | Приёмка | [x] | `npm test` 328 pass / 0 fail, `npm run build`, `npm run audit:workerization:strict`; десктоп не изменился (рейл 52px, 19 кнопок, канвас 1388 из 1440, сетка и Copy/Paste на месте, FAB и шторки нет) |

## Developer Pro (запрос фаундера 2026-09-28)

Проблема: 3-дневный триал выведен из продукта (`activateProTrial` помечен LEGACY), а другого способа получить Pro без покупки нет — то есть **свои же Pro-функции нельзя было протестировать**.

| # | Задача | Статус | Что сделано |
|---|--------|--------|-------------|
| 1 | Оверрайд в BillingService | [x] | `realContext` (реальный контекст из лицензии/триала) отделён от `currentContext`; единственный писатель контекста — приватный `setContext()`, поэтому оверрайд нельзя обойти новой присвоенной строкой. `setLocalPro()` переключает и возвращает фактическое состояние, `initialize()` и `saveToken()` продолжают обновлять `realContext`, так что выключение оверрайда возвращает именно реальный план, а не Free |
| 2 | Жёсткая гарантия «только dev» | [x] | `allowLocalPro: import.meta.env.DEV` в `create-platform.ts`. Vite заменяет `import.meta.env.DEV` на литерал `false` — в собранном бандле это видно как `allowLocalPro:typeof …<"u"&&!1`. То есть **в проде оверрайд не существует как код**, а не «запрещён политикой» |
| 3 | Флаг в localStorage не помогает | [x] | `local-pro.ts` — только чтение/запись флага, без политики. При `allowLocalPro === false` `isLocalProEnabled()` всегда `false`, поэтому вручную записанный `localpdf_dev_pro_override=1` ничего не даёт. Проверено на прод-сборке: флаг записан руками + reload → бейджа PRO нет, Upgrade и Activate на месте, план остался Free |
| 4 | Кнопка в наве | [x] | Янтарная `DEV`/`DEV PRO` (стул 44px на тач, мобильный нав 390/390 без переполнения). Специально не похожа на синий бейдж плана: янтарный = оверрайд, синий PRO = реальная лицензия. Заголовок прямо говорит «this is not a purchase» |
| 5 | Тесты | [x] | 4 теста в `billing-service.test.ts` (денежный код): прод-сборка не может включить оверрайд; предзаписанный флаг не даёт Pro; dev-сборка даёт полный Pro и возвращает реальный контекст при выключении; оверрайд не ломает реальную Pro-лицензию (`['pdf.ocr']` сохраняется после выключения) |
| 6 | Проверка | [x] | dev: `DEV` → клик → бейдж PRO, Upgrade/Activate скрыты → клик → снова Free. prod-сборка (`dist`, SPA-fallback): кнопки нет вообще, флаг руками не работает. `npm test` 332 pass / 0 fail, `npm run build`, `npm run audit:workerization:strict` |

| 13 | **Багрепорт фаундера: не тянется текст, не рисует от руки** | [x] | Симптомы воспроизведены только на узких вьюпортах: 469×453 и 390×664 — `dragMoved: false`, `draftPolylines: 0`; на 1280×860 и перетаскивание, и рисование работали. Причина — **мой же оверлей из п.11**: на 390×664 он накрывал канвас так, что от страницы оставалось 50px, и жест уходил в панель, а не в документ. Атрибуция проверена отдельным worktree на HEAD (013153e): там панель схлопывалась в 0px и перекрытия не было — то есть регрессию внёс я, а не продукт. Исправлено переводом панели в поток. Проверка матрицей 5 кейсов (1280×860 / 469×453 / 390×664 × mouse / touch): после правки `dragMoved: true` и `drawingWorked: true` во всех пяти, `Insert` активируется, элемент добавляется |
| 14 | Диагностический инструмент | [x] | `test-results/mobile-audit/sign-matrix.mjs` — прогоняет «вставить подпись → перетащить → режим Draw → нарисовать → Insert» на матрице вьюпортов и типов указателя. Первая версия скрипта врала: целилась в точки, накрытые панелью, и «находила» баг там, где его не было; координаты берутся из скролл-контейнера `.studio-edit-canvas-wrap`, а не из контента |

Почему это не дыра: `plan: 'pro'` — единственное, что читают все гейты (`plan-limits.ts`, `daily-file-quota.ts`, `requestDailyFileAllowance`: `plan !== 'basic'`), и в прод-бандле это значение невозможно выставить через этот механизм. Для тестирования на телефоне/проде — не бэкдор, а **реальная лицензия**: скидка 100% в LemonSqueezy → обычный чекаут → ключ → «Activate». Это заодно закрывает висящую задачу «проверить restore Pro по license key» (проверять было не на чем).

Ключевые файлы: `src/styles.css` (блок «Mobile shell (<= 760px)» в конце), `src/v6/components/Studio/StudioToolRail.tsx` (`StudioToolList` + `StudioToolSheet`), `StudioShell.tsx` (брейкпоинт `STUDIO_MOBILE_BREAKPOINT = 760` дублирует медиазапрос — менять вместе), `StudioDocument.tsx`, `StudioEditWorkspace.tsx`, `edit/use-studio-edit-zoom.ts`, `src/app/react/studio-top-nav.tsx`, `index.html`.

Не сделано (осознанно, следующие шаги): share-target для PDF из других приложений — требует service worker и `POST`-обработчика, отдельное решение; лонг-пресс для переноса страницы пальцем и одно-пальцевая панорама поверх страницы (сейчас панорама работает по фону, страница тянется сразу); мобильных e2e нет; снятие hover-семантики у плавающего меню.

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
