# LocalPDF V6: Архитектура и текущее состояние

Дата снимка: 2026-02-18

## 1. Назначение проекта

LocalPDF V6 - локальная браузерная платформа для обработки PDF/Office-документов с плагинной архитектурой, воркер-исполнением и Studio-first UX.

Ключевые цели текущей реализации:
- единый Studio-хаб (`/studio`) как точка входа;
- запуск инструментов через общий runtime/runner;
- единый реестр инструментов на базе `definition.ts`;
- контроль лимитов/доступов/телеметрии на уровне core.

## 2. Архитектурная карта (слои)

## 2.1 UI и навигация

- Точка входа: `src/main.tsx`.
- Приложение: `src/app/react/platform-app.tsx` -> `src/app/react/studio-platform-shell.tsx`.
- Роутинг: `src/app/react/tool-routes.tsx`.
  - `/studio` - Studio workspace.
  - `/studio/edit` - Studio Edit workspace.
  - `/:toolId` - wizard для зарегистрированных standalone-инструментов (кроме скрытых).
- Меню/роуты генерируются из registry: `src/app/navigation/build-tool-menu.ts`, `src/app/routing/build-tool-routes.ts`.

## 2.2 Platform/runtime слой

- Bootstrap: `src/app/platform/bootstrap.ts`.
- Runtime factory: `src/app/platform/create-platform.ts`.
- Состав runtime:
  - `registry` (инструменты),
  - `vfs` (квоты + cleanup temp),
  - `runner` (доступ/исполнение/телеметрия),
  - `workerOrchestrator` (web worker / in-process),
  - `telemetry` (bus).

## 2.3 Core слой

- Реестр инструментов:
  - `src/core/registry/register-tools.ts` (`import.meta.glob('../../plugins/**/definition.ts')`).
  - `src/core/registry/global-registry.ts`.
- Исполнитель:
  - `src/core/runner/unified-tool-runner.ts`.
  - Проверки: entitlements, tier, monthly quota, max file size, max pages.
  - OCR (`ocr-pdf`) принудительно выполняется in-process (`shouldRunInProcess`).
- Воркеры:
  - `src/core/workers/worker-orchestrator.ts`,
  - `src/core/workers/worker-runtime.ts`,
  - `src/core/workers/worker-entrypoint.ts`.
- Storage/VFS:
  - `src/core/io/web-filesystem-adapter.ts` (IndexedDB + memory fallback),
  - `src/core/vfs/virtual-file-system.ts` (квоты: total/temp, scope cleanup).
- Телеметрия:
  - `src/core/telemetry/telemetry.ts` (`TelemetryBus`, bounded history).

## 2.4 Services слой

- PDF-пайплайны и утилиты: `src/services/pdf/*`.
- OCR-движок и языковая логика: `src/services/ocr/*`.
- Важные runtime-ограничения:
  - шифрование/дешифрование использует `qpdf` (Node runtime + бинарник в PATH): `src/services/pdf/qpdf-engine.ts`;
  - OCR зависит от rasterizer/canvas/tesseract среды.

## 2.5 Plugin слой

Каждый инструмент содержит:
- `src/plugins/<tool>/definition.ts` (id, name, limits, loaders),
- `src/plugins/<tool>/logic/index.ts`,
- `src/plugins/<tool>/ui/index.tsx`.

Всего зарегистрировано 12 инструментов.

## 2.6 Studio слой

- Workspace-канвас: `src/v6/components/Studio/StudioShell.tsx`.
- Состояние: `src/v6/components/Studio/studio-store.ts` (zustand).
- Inline-операции/меню: `src/v6/components/Studio/StudioFloatingMenu.tsx`.
- Редактирование текста/аннотаций: `src/v6/components/Studio/StudioEditWorkspace.tsx`.
- Экспорт/пайплайн воркер: `src/v6/studio/pipeline/PipelineRunner.ts`, `src/v6/studio/pipeline/pipeline.worker.ts`.

## 3. Поток выполнения

1. UI выбирает инструмент (роут/menu из registry).
2. `runTool` -> `UnifiedToolRunner.execute`.
3. Runner делает access-check (entitlement/tier/quota/file limits).
4. Исполнение:
   - через worker (`PROCESS_TOOL`), либо
   - in-process (текущая спец-ветка для `ocr-pdf`).
5. Результат записывается в VFS, UI отображает файлы/ссылки на скачивание.
6. Телеметрия отправляется в `TelemetryBus` + sink.

## 4. Текущее состояние качества (факт на 2026-02-18)

Проверено локально:
- `npm test`: `134/134` pass.
- `npm run build`: green.
  - Ранее блокер `TS7016` по `pdfjs-dist/build/pdf.mjs` закрыт добавлением декларации:
    - `src/types/pdfjs-dist-build.d.ts`.
  - В сборке остаётся non-blocking предупреждение Vite по крупным чанкам.

Дополнительно:
- unit test файлов: `42`.
- e2e spec файлов: `19`.
- targeted e2e: `e2e/pdf-editor-p0-flow.spec.ts` -> `3/3` pass.

## 5. Функции, доступные сейчас

## 5.1 Доступные пользователю в текущем UI (standalone + studio)

| Tool ID | Название | Доступ в UI | Tier | Технический статус |
|---|---|---|---|---|
| `ocr-pdf` | OCR PDF | standalone route + Studio convert action | pro | работает, зависит от OCR/rasterizer среды |
| `word-to-pdf` | Word to PDF | standalone route | basic | работает |
| `excel-to-pdf` | Excel to PDF | standalone route | basic | работает |
| `pdf-to-jpg` | PDF to JPG | standalone route + Studio convert action | basic | работает при наличии rasterizer/canvas |
| `compress-pdf` | Compress PDF | standalone route + inline в Studio | basic | работает |
| `merge-pdf` | Merge PDF | standalone route | basic | работает |
| `encrypt-pdf` | Encrypt PDF | standalone route | basic | работает при наличии `qpdf` |
| `unlock-pdf` | Unlock PDF | standalone route | basic | работает при наличии `qpdf` |
| `pdf-editor` | PDF Editor | standalone route | pro | работает: text edit/add, undo/redo, rect/circle/line/whiteout, drag-and-drop upload, unsaved-change guards, export |

## 5.2 Зарегистрированы, но скрыты из standalone-навигации

Скрытие задается в `src/app/tool-visibility.ts`:
- `rotate-pdf`
- `split-pdf`
- `delete-pages-pdf`

Важно:
- они остаются в plugin-реестре и имеют `logic/ui`,
- но исключаются из `menu` и `routes` через фильтрацию (`buildToolMenu`, `buildToolRoutes`),
- прямого standalone entrypoint в текущем UI нет.

## 5.3 Studio-функции (workspace)

Сейчас реализованы:
- загрузка PDF drag-and-drop и через диалог;
- workspace-модель (документы/страницы), перетаскивание страниц между workspace;
- detached pages (временное изъятие страницы из документа);
- экспорт активного workspace в PDF через pipeline worker;
- inline компрессия активного workspace (`compress-pdf`);
- Studio Edit:
  - text edit с true-replace/fallback логикой,
  - annotate, whiteout, shapes,
  - undo/redo,
  - save/undo-save/redo-save,
  - телеметрия guardrails и save actions.

## 6. Конфигурация доступа и лимитов

- Все лимиты/tiers описаны в `definition.ts` каждого инструмента.
- В wizard по умолчанию используется демо-контекст `pro` с полным набором entitlements:
  - `src/v6/hooks/useWizardFlow.ts` (`DEFAULT_TOOL_CONTEXT`).
- Режим fallback для проверки page count:
  - env: `VITE_V6_PAGE_COUNT_FALLBACK_MODE` / `V6_PAGE_COUNT_FALLBACK_MODE`,
  - default: `limited`.

## 7. Известные технические риски/ограничения

- `pdf-editor` P0-функции закрыты на уровне standalone сценариев; в backlog остаются P1/P2 расширения (images/page-delete).
- `encrypt-pdf`/`unlock-pdf` зависят от установленного `qpdf`.
- OCR/PDF-to-JPG функциональность зависит от среды выполнения (canvas/worker/tesseract).
- В production-сборке есть предупреждение о размерах chunk-файлов (оптимизация chunking/manualChunks остаётся задачей).
