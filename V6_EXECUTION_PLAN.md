# LocalPDF V6: План выполнения

## 0) Цель миграции
- Перейти от `Legacy/V5` к архитектуре `GlobalRegistry + Plugin Model + Worker Orchestrator + VFS + UnifiedToolRunner`.
- Убрать ручной роутинг/навигацию и размазанную монетизацию из инструментов.
- Гарантировать отзывчивый UI при тяжелой обработке PDF.
- Полностью разорвать связку `V6 Frontend -> Legacy Backend (main thread)` и перенести бизнес-логику обработки в `Worker Runtime`.

## 1) Фазы и порядок

### Фаза 1. Архитектурные контракты (2-3 дня)
Результат:
- Зафиксированы интерфейсы:
  - `IToolDefinition`
  - `IFileEntry`, `IFileSystem`
  - `IWorkerCommand`, `IWorkerEvent`
  - `ToolLimits`, `Entitlements`, `FeatureTier`
- Описан протокол `Command/Event` и коды ошибок (`TOOL_ACCESS_DENIED`, `TOOL_LIMIT_EXCEEDED`, `TOOL_ERROR`).

Definition of Done:
- Все контракты утверждены и не содержат неявных полей.
- Есть примеры payload для `merge-pdf`.

### Фаза 2. Ядро платформы V6 (4-6 дней)
Результат:
- Реализован `GlobalRegistry` как единый источник истины.
- Реализован `WorkerOrchestrator`.
- Реализован `UnifiedToolRunner`.
- Реализован `VirtualFileSystem` + `IO adapters` (web/tauri abstraction).

Definition of Done:
- Любой инструмент может запускаться через единый `runner.execute(toolId, inputIds, params)`.
- UI не обращается к `Worker` напрямую.
- Роуты и меню строятся только из `GlobalRegistry`.

### Фаза 3. Плагинная модель инструментов (3-5 дней)
Результат:
- Стандарт структуры:
  - `plugins/<tool-id>/ui/index.tsx`
  - `plugins/<tool-id>/logic/index.ts`
  - `plugins/<tool-id>/definition.ts`
- Ленивая загрузка UI (`React.lazy`/динамический импорт).
- Автоматическая регистрация `definition.ts`.

Definition of Done:
- Добавление нового инструмента = создание папки плагина без правок центрального роутера.

### Фаза 4. Миграция бизнес-логики в Web Workers (1-2 недели, блокирующая)
Результат:
- Проведен inventory всех вызовов `src/services/*` и разделение на:
  - `worker-only` (допустимо);
  - `main-thread forbidden` (подлежит миграции/удалению).
- Введен явный слой worker-адаптеров для PDF/OCR/QPDF/Rasterizer/Compress.
- UI/app-слой отправляет только команды в `UnifiedToolRunner/WorkerOrchestrator`, без прямых вызовов legacy-сервисов.

Definition of Done:
- В `src/app/**`, `src/v6/**`, `src/plugins/**/ui/**` отсутствуют импорты `src/services/**`.
- Все CPU/IO-heavy операции выполняются в worker-контуре.
- Для каждой мигрированной операции есть контрактный тест `UI -> Runner -> Worker -> Logic -> VFS`.

### Фаза 5. Миграция инструментов волнами (1-2 недели)
Результат:
- Волна 1: `merge`, `split`, `ocr` (или самые тяжелые по CPU/RAM).
- Волна 2: остальные инструменты пакетами.

Definition of Done:
- Каждый мигрированный инструмент:
  - не содержит бизнес-логики в UI;
  - исполняется через `UnifiedToolRunner` и `WorkerOrchestrator`;
  - хранит файлы через `VFS`, без прямого хаотичного `ObjectURL` lifecycle.

### Фаза 6. Стабилизация и релиз (3-5 дней)
Результат:
- Тесты контрактов/интеграций.
- Профилирование main thread, память, утечки.
- Rollout-план и rollback-план.

Definition of Done:
- Нет блокировок UI на типовых больших файлах.
- Нет долгоживущих утечек blob/objectURL.
- Монетизация работает декларативно через `definition.limits/entitlements`.

## 2) Рабочий backlog (приоритет)

P0:
- Ввести типы контрактов ядра V6.
- Поднять `GlobalRegistry`.
- Поднять `WorkerOrchestrator` + протокол сообщений.
- Поднять `UnifiedToolRunner` с валидацией лимитов/прав.
- Поднять `VFS` и адаптер веб-хранилища.
- Мигрировать 1 инструмент end-to-end (`merge-pdf`) как референс.
- Провести инвентаризацию всех `src/services/*` импортов и закрыть `main-thread forbidden` вызовы.
- Ввести release-blocker: релиз запрещен при наличии forbidden-вызовов.

P1:
- Автоскан/авторегистрация плагинов.
- Tauri-адаптер файловой системы.
- Миграция остальных тяжелых инструментов.
- Перенос `PdfFileMetadataService` из app-слоя в worker/runner-контур (или безопасный async gateway без блокировки UI).

P2:
- Оптимизации пула воркеров.
- Расширенная телеметрия и аналитика лимитов.

## 3) Технические правила внедрения
- Любая тяжелая обработка (`pdf-lib`, OCR, сжатие, рендер) выполняется только в воркере.
- Любой доступ к файлам проходит только через `VFS/IFileSystem`.
- Любая проверка монетизации/лимитов проходит только в `UnifiedToolRunner`.
- UI не знает деталей хранения/воркеров/подписок.
- Прямые вызовы legacy/backend сервисов из main thread запрещены (`src/app/**`, `src/v6/**`, `src/plugins/**/ui/**`).

## 4) Риски и контроль
- Риск: рост сложности message protocol.
  - Контроль: строгие TS-типы, versioned message schema.
- Риск: утечки памяти при blob/objectURL.
  - Контроль: централизованный lifecycle в VFS + cleanup hooks.
- Риск: регрессии на миграции.
  - Контроль: wave-миграция, контрактные тесты, feature flags.

## 5) План на ближайшие 5 рабочих дней

День 1:
- Зафиксировать inventory `src/services/*` импортов и классификацию `worker-only/main-thread forbidden`.
- Утвердить план миграции forbidden-вызовов.

День 2:
- Перенести first batch forbidden-вызовов (тяжелые PDF/OCR операции) в worker-контур.
- Добавить regression-тесты для мигрированных вызовов.

День 3:
- Перенести `PdfFileMetadataService` и связанные pre-check в неблокирующий контур.
- Проверить cancel/timeout/retry при долгих сценариях.

День 4:
- Закрыть remaining forbidden-вызовы + cleanup/telemetry корреляцию.
- Прогнать интеграционный путь `UI -> Runner -> Worker -> Logic -> VFS`.

День 5:
- Поставить quality gate на отсутствие forbidden-вызовов.
- Зафиксировать отчет по latency main thread и готовность к волне 2.

## 6) Критерий успеха миграции
- Новый инструмент добавляется без правок центрального роутинга.
- UI не подвисает на длительной обработке.
- Ограничения/права меняются декларативно в `definition.ts`.
- Управление файлами централизовано и безопасно по памяти.
- Нет прямых вызовов legacy/backend обработки из main thread.

## 7) Текущий статус (обновлено)
- `done`: создан каркас `src/core/*` и `src/plugins/*`.
- `done`: введены ключевые контракты (`IToolDefinition`, `ToolLogicFunction`, Worker Command/Event, VFS контракты).
- `done`: реализован `GlobalRegistry` и Vite-discovery `plugins/**/definition.ts`.
- `done`: реализован `UnifiedToolRunner` с проверками `entitlements`, `featureTier`, `maxFileSize`, `maxPagesPerFile`, `monthlyQuota`.
- `done`: реализованы базовые `WorkerOrchestrator` (web + in-process) и `worker-runtime`.
- `done`: добавлен `worker-entrypoint` для запуска `worker-runtime` в отдельном потоке.
- `done`: добавлен `app`-слой `createPlatformRuntime` + генерация `routes/menu` строго из `GlobalRegistry`.
- `done`: добавлен референсный плагин `merge-pdf`.
- `done`: добавлены референсы `split-pdf` и `ocr-pdf`.
- `done`: заглушки `merge/split/ocr` заменены на рабочую логику worker-уровня (чтение/запись через `IFileSystem`, валидация входа, прогресс).
- `done`: добавлены базовые тесты для `GlobalRegistry` и `UnifiedToolRunner`.
- `done`: добавлены тесты derivation для `routes/menu`.
- `done`: добавлены unit-тесты для `merge/split/ocr` logic.
- `done`: добавлены тесты `WorkerOrchestrator` (progress/final event/timeout).
- `done`: `WebFileSystemAdapter` переведен на IndexedDB-backed хранение (с in-memory fallback для не-browser окружений).
- `done`: добавлен `bootstrapPlatform()` для сборки `runtime + routes + menu` из реестра.
- `done`: добавлен прогресс-канал `Runner -> UI` и helper `runTool()` для вызова инструментов из app-слоя.
- `done`: добавлен React-интеграционный слой (`PlatformProvider`, `ToolRoutes`, `ToolSidebar`, `PlatformApp`, `useToolExecution`).
- `done`: добавлена документация подключения React-слоя (`src/app/react/INTEGRATION.md`).
- `done`: добавлен сервисный слой для внешних движков (`src/services/pdf`, `src/services/ocr`) и подключен в `merge/split/ocr` logic.
- `done`: инициализирован project runtime (`package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`).
- `done`: зависимости установлены, `npm test` проходит (20/20), `npm run build` проходит.
- `done`: добавлен CI workflow (`.github/workflows/ci.yml`) с `npm ci`, `npm test`, `npm run build`.
- `done`: добавлен pipeline smoke test (`src/app/platform/pipeline-smoke.test.ts`) для `merge -> split -> ocr`.
- `done`: подключен `PdfFileMetadataService` в runtime для проверки `maxPagesPerFile` без runtime-ошибок.
- `done`: добавлен telemetry слой раннера (`src/core/telemetry/telemetry.ts`) и события `start/progress/deny/result/error`.
- `done`: добавлен helper `runToolWithTempInputs()` с гарантированной очисткой temp scope.
- `done`: добавлены тесты на cleanup policy VFS и telemetry runner.
- `done`: добавлен UI message mapping для `TOOL_ACCESS_DENIED/TOOL_ERROR` и интеграция в `useToolExecution`.
- `done`: добавлена VFS quota policy (`maxTotalBytes`, `maxTempBytes`) с проверками переполнения и recovery.
- `done`: подключены реальный UI инструментов (`merge/split/ocr`) с действиями `Run` и `Download`.
- `done`: добавлен helper скачивания результатов (`downloadOutputFiles`) из `VFS` в браузере.
- `done`: подключена telemetry шина/панель в UI (`TelemetryBus`, `TelemetryPanel`, `useTelemetryLog`) с корреляцией по `runId`.
- `done`: устранена проблема пустого реестра инструментов в браузере (корректный `import.meta.glob` discovery).
- `done`: введён `ENGINEERING_CHECKLIST.md` и строгий OCR-контур с явными кодами ошибок (`OCR_*`) вместо неявных крэшей.
- `done`: OCR UI принимает `application/pdf,image/*`; для `image/*` OCR выполняется.
- `done`: прокинуты custom `error.code` из worker runtime в `TOOL_ERROR` и UI message mapping.
- `done`: добавлен protect-контур `qpdf` (`src/services/pdf/qpdf-engine.ts`) с кодами ошибок `PROTECT_QPDF_UNAVAILABLE/PROTECT_QPDF_EXECUTION_FAILED/PROTECT_INVALID_OPTIONS`.
- `done`: добавлен референсный плагин `encrypt-pdf` (`definition/logic/ui`) с worker-исполнением и опциями `userPassword/ownerPassword/keyLength`.
- `done`: добавлен UI message mapping для protect-кодов в `toUserMessage()`.
- `done`: устранена нестабильность `excel-to-pdf` на невалидных входах (ранняя проверка container signature ZIP/CFB).
- `done`: browser e2e smoke на Playwright выполняется (`6/6 passed`).
- `done`: текущее состояние quality-gate: `npm test` `55/55`, `npm run build` green, `npm run test:e2e` green.
- `done`: внедрен паттерн **Linear Wizard (Focus Mode)** с этапами Upload -> Config -> Processing -> Result.
- `done`: реализован **EntitlementGate** (пре-валидация доступа) в `UnifiedToolRunner.validateAccess`.
- `done`: обновлен дизайн: **Inter font**, **Glassmorphism**, плавные анимации и кастомные скроллбары.
- `done`: рефакторинг UI под Wizard-пакет: `merge-pdf`, `compress-pdf`, `ocr-pdf`, `word-to-pdf`, `encrypt-pdf`.
- `done`: централизованная навигация и брендинг «LocalPDF V6» в сайдбаре.
- `done`: реализован плагин **Unlock PDF** (`definition/logic/ui`) с worker-исполнением через `qpdf` (`decrypt`) и Wizard UI.
- `done`: интегрирован PDF rasterizer (`pdf.js -> image`) в OCR pipeline (без CDN `workerSrc`, с `disableWorker` в текущем worker/runtime).

## 8) Frontend Focus Wizard (из `Frontend.md`)

Цель:
- Внедрить state-machine контур `WizardShell + useWizardFlow` для сценария `Upload -> Config -> Processing -> Result`.
- Зафиксировать V6-дисциплину на UI-слое: `VFS First`, `Worker Orchestrator`, `Registry-driven UI`.

Контракт этапов:
1. `Upload (The Gate)`:
- Использовать `SmartUploadZone`.
- Сразу писать дропнутые файлы в `VFS` (`vfs.write`), в стейте хранить только `fileId`.
- На `QuotaExceededError` показывать toast, не переводить flow на следующий этап.
- После записи запускать limit-check; при fail: показать upsell, удалить загруженные `fileId` из `VFS`, сбросить flow.
2. `Config (Polymorphic)`:
- Загружать UI-конфиг инструмента через `toolDef.uiLoader`.
- Передавать `IToolConfigProps` (`inputFiles: string[]`).
- Если загрузка UI падает: показывать error-boundary + `Retry`.
3. `Processing (Dynamic Island)`:
- Запускать `PROCESS_TOOL` через `WorkerOrchestrator`.
- Обрабатывать события `PROGRESS`, `ERROR`, `RESULT`.
- Поддерживать отмену через `AbortController`.
4. `Result`:
- Скачивание результата через `IOAdapter.save(fileId)`.

Статус внедрения:
- `done` (2026-02-09): введены `src/v6/components/Wizard/types.ts`, `src/v6/hooks/useWizardFlow.ts`, `src/v6/components/Wizard/WizardShell.tsx` как state-machine контур `Upload -> Config -> Processing -> Result`.
- `done` (2026-02-09): `WorkerOrchestrator.dispatch` поддерживает штатную отмену через `AbortSignal`, включая pre-aborted/in-flight сценарии без зависания промиса (`WORKER_ABORTED`).
- `done`: `ToolRoutes` переведен на V6 `WizardShell` без legacy fallback.
- `done`: UI-конфиги инструментов унифицированы под контракт `inputFiles/onStart/onBack`, удалены runtime-адаптеры `any`.
- `done`: smoke e2e для мигрированных сценариев проходит в V6-потоке (`5 passed`).
- `done`: выделено testable state-machine ядро `src/v6/hooks/wizard-flow-core.ts` и добавлены unit-тесты `src/v6/hooks/wizard-flow-core.test.ts` для сценариев `quota`, `limit fail + cleanup`, `abort`, `result`.
- `done`: в `useWizardFlow` добавлен `retryConfigLoad()` для повторной загрузки `uiLoader` после ошибки (`ErrorBoundary -> Retry`).
- `done`: локальные placeholder-уведомления вынесены в централизованный слой `src/app/react/ux-feedback-overlay.tsx`; `WizardShell` публикует `UI_TOAST_SHOWN/UI_UPSELL_SHOWN` в `TelemetryBus`.
- `done`: telemetry расширена UI-событиями (`UI_TOAST_SHOWN`, `UI_UPSELL_SHOWN`) для аналитики пользовательских проблем и upsell-триггеров.
- `done`: `UnifiedToolRunner` публикует `UI_TOAST_SHOWN(level=error)` на worker-failure/dispatch-failure вместо проброса необработанных ошибок в UI.
- `done`: в `ux-feedback-overlay` добавлена дедупликация тостов по `toolId + level + message` с окном подавления, чтобы исключить всплески одинаковых ошибок.
- `done`: для access-deny в `UnifiedToolRunner.validateAccess` публикуется `UI_UPSELL_SHOWN` с тем же `runId`, что и `TOOL_RUN_DENIED` (корреляция событий runner/UI).
- `done`: добавлена telemetry-метрика `UI_TOAST_DEDUPED` (частота подавленных дублей тостов) и расширен вывод `TelemetryPanel` (`toolId`, `code`, `message`).
- `done`: добавлен e2e сценарий dedupe-шторма (`e2e/toast-dedupe.spec.ts`) с проверкой: один визуальный toast при серии одинаковых ошибок + наличие telemetry-события `UI_TOAST_DEDUPED`.
- `done`: подключен billing CTA: `View plans` открывает destination из `VITE_BILLING_URL` (fallback `/pricing`) через `src/app/react/billing.ts`; клик трекается событием `UI_UPSELL_CTA_CLICKED`.
- `done`: удален прямой импорт `PdfFileMetadataService` из `src/app/platform/create-platform.ts`; pre-check `maxPagesPerFile` выполняется через worker-команду `GET_PDF_PAGE_COUNT`.
- `done`: `audit:workerization:strict` green для forbidden-зон (`src/app/**`, `src/v6/**`, `src/plugins/**/ui/**`).
- `done`: усилен boundary-audit для UI-слоев: разрешены только публичные core API (`src/core/public/*`), прямые импорты core-реализаций теперь блокируют strict gate.
- `done`: strict-аудит дополнен правилом `core -> services`: импорты `src/services/**` разрешены только в `src/core/workers/**`.
- `done`: добавлены telemetry-события `PAGE_COUNT_CHECK_RESULT/PAGE_COUNT_CHECK_ERROR` для наблюдаемости pre-check `GET_PDF_PAGE_COUNT` (latency/error-rate/timeout-rate по коду).
- `done`: внедрен circuit-breaker pre-check `GET_PDF_PAGE_COUNT` (default 15s) с детерминированным кодом `PAGE_COUNT_CHECK_TIMEOUT` и negative e2e-сценарием.
- `done`: добавлен CI job `e2e-smoke` для PR в `main`/`release/*` (после `test-and-build`).
- `done`: добавлен audit-скрипт `scripts/workerization-audit.mjs` для инвентаризации импортов `services/*` с классификацией зон (`main-thread-forbidden`, `worker-only`, `test-only`).
- `done`: добавлены npm-команды `audit:workerization` и `audit:workerization:strict`; strict-режим теперь используется как release-blocker для forbidden-зон.
- `done` (2026-02-09): расширена наблюдаемость pre-check page-count внутри воркера: добавлены `DIAGNOSTIC` этапы (`WORKER_COMMAND_RECEIVED`, `WORKER_FS_READ_*`, `WORKER_PARSE_*`, `WORKER_COMMAND_DONE`) и их проброс в telemetry как `PAGE_COUNT_WORKER_STAGE`.
- `done` (2026-02-09): устранен критический orchestration-баг "lost termination state": `WebWorkerOrchestrator` теперь корректно завершает `GET_PDF_PAGE_COUNT` по финальному событию `PAGE_COUNT_RESULT` (не только `RESULT/ERROR`).
- `done` (2026-02-09): добавлены regression-тесты на оба контура: `worker-runtime` (эмиссия `DIAGNOSTIC`) и `worker-orchestrator` (settle по `PAGE_COUNT_RESULT`), а также runner-тест на публикацию `PAGE_COUNT_WORKER_STAGE`.
- `done` (2026-02-09): введена policy-настройка fallback pre-check `VITE_V6_PAGE_COUNT_FALLBACK_MODE=off|limited|on` (default `limited`), где fallback разрешен только для `WORKER_TIMEOUT`/`WORKER_CRASH`.
- `done` (2026-02-09): стабилизирован e2e-поток split/worker-path; подтвержден рабочий профиль V6 без деградации в legacy: `npm run test:e2e` green, `npm run report:fallback-budget` показывает `fallback rate = 0.000`.
- `done` (2026-02-09): стабилизирован e2e-runner: Playwright переведен на deterministic профиль (`workers=1`, `fullyParallel=false`, `build + preview` webServer, `127.0.0.1:4173`), flaky-сценарии усилены recovery-путями.
- `done` (2026-02-09): обновлены и переименованы fallback e2e-сценарии с явной семантикой режимов (`fallback=on` и `fallback=off`) и устойчивыми критериями проверки.
- `done` (2026-02-09): выполнена волна `UI/UX 2026` для shell/wizard: единый стиль `Liquid Glass + Linear` (layout, sidebar, telemetry panel, wizard chips/cards/progress/actions).
- `done` (2026-02-09): унифицированы UI-конфиги инструментов `src/plugins/*/ui/index.tsx` под единый design-contract (`tool-config-*`, `btn-*`) без изменения worker-логики.
- `done` (2026-02-09): `UxFeedbackOverlay` мигрирован на общий визуальный язык и CSS-классы (`ux-toast-*`, `ux-upsell-*`) с сохранением telemetry/dedupe поведения.
- `done` (2026-02-09): подтвержден свежий quality snapshot после UI-волны: `npm run build` green, `npm test` `78/78`, `npm run test:e2e` `10/10`, `npm run audit:workerization:strict` green.
- `done` (2026-02-09): стартован `Preview MVP` в wizard: добавлены `FilePreviewService` (PDF first-page/image thumbnail + LRU objectURL cache), `useFilePreviews`, `PreviewPanel`; добавлены unit-тесты и перепроверены `build + test + e2e`.
- `done` (2026-02-09): расширен `Preview MVP`: добавлены `pageCount` для PDF, пагинация списка превью (`Prev/Next`) и lazy-load картинок через `IntersectionObserver`; включена telemetry (`UI_PREVIEW_RENDERED/UI_PREVIEW_ERROR`), quality gates повторно green.
- `done` (2026-02-09): реализован page-level preview для PDF-карточек в `PreviewPanel` (переключение страниц `Prev page/Next page`) с кэшом миниатюр страниц в `FilePreviewService` и повторной проверкой `build + test + e2e`.
