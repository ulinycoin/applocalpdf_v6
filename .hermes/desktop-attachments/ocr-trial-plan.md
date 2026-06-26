# OCR Trial: 3 страницы бесплатно

## Суть

Дать пользователю 3 страницы OCR бесплатно. После — paywall. Это главный рычаг конверсии: пользователь видит реальный результат OCR на своём документе, понимает ценность, и decision become informed.

## Как работает сейчас

1. Пользователь запускает OCR → обрабатываются ВСЕ страницы
2. `allowOcrDownload = isPro || getDailyUsage('ocr-pdf') < OCR_DAILY_LIMIT` (3/день)
3. Если true → показать полный результат + скачивание
4. Если false → показать OcrPaywallOverlay (blurred text + blurred thumbnails)

**Проблема:** Лимит 3/день. Пользователь может делать 3 OCR каждый день бесплатно. Paywall показывается только когда лимит исчерпан, но пользователь уже получил value.

## Новый дизайн

### Логика

1. **3 страницы за запуск** — Каждый OCR запуск обрабатывает первые 3 страницы бесплатно
2. **После 3 страниц** — Показать blurred preview (текущий OcrPaywallOverlay)
3. **Без дневного лимита** — Убрать `OCR_DAILY_LIMIT` для OCR, заменить на 3-страничный лимит

### Флоу

```
Пользователь загружает 10-страничный PDF
  → Запускает OCR
  → OCR обрабатывает страницы 1-3
  → Показывается результат для страниц 1-3 (editable textarea + download)
  → Под результатом: paywall overlay
    "Your document has 10 pages. Upgrade to Pro to process all 10 pages."
    CTA: "Start free trial — 3 days" (primary)
    CTA: "Upgrade to Pro — $3.99/mo" (secondary)
```

## Файлы для изменения

### 1. `src/v6/components/Studio/convert/use-studio-convert-controller.ts`

**Изменение:** Ограничить количество страниц, отправляемых в OCR

Найти место, где формируется список страниц для OCR (строки ~243-251). Добавить логику:

```typescript
// Вместо отправки всех страниц, отправляем только первые 3 для free plan
const MAX_TRIAL_PAGES = 3;
const isPro = billingPlan === 'pro';

const targetPages = useMemo<StudioConvertPageRef[]>(() => {
  const allPages = operationScope === 'selection'
    ? collectSelectedPages(documents, selection)
    : activeDocument
      ? collectDocumentPages(activeDocument)
      : [];

  if (isPro) return allPages;
  return allPages.slice(0, MAX_TRIAL_PAGES);
}, [/* deps */]);
```

**Изменение:** Изменить `allowOcrDownload`

Текущая строка 168:
```typescript
const allowOcrDownload = isPro || getDailyUsage('ocr-pdf') < OCR_DAILY_LIMIT;
```

Новая логика:
```typescript
// Для OCR trial: показываем результат если обработано <= 3 страниц
// Если > 3 страниц (Pro) — всегда показываем
const allowOcrDownload = isPro || targetPages.length <= MAX_TRIAL_PAGES;
```

**Изменение:** Добавить информацию о total pages в state

```typescript
const [totalPageCount, setTotalPageCount] = useState(0);
```

Установить при обработке:
```typescript
setTotalPageCount(allPages.length); // до обрезки до 3 страниц
```

### 2. `src/v6/components/Studio/convert/StudioConvertWorkspace.tsx`

**Изменение:** Обновить OcrPaywallOverlay для показа информации о страницах

Текущий OcrPaywallOverlay (строки 61-183) уже показывает blurred text + thumbnails. Добавить:

1. Проп `totalPages` и `freePages` (3)
2. Сообщение: "Your document has {totalPages} pages. Free plan processes first 3. Upgrade to Pro for all {totalPages}."
3. Trial-first CTA (из предыдущего плана)

```tsx
function OcrPaywallOverlay({
  content,
  pages,
  totalPages,
  freePages = 3
}: {
  content: string;
  pages?: PreviewPageInfo[];
  totalPages?: number;
  freePages?: number;
}) {
  const trialState = getTrialState();

  // ... существующий blurred text preview ...

  {/* Paywall section */}
  <div style={{ textAlign: 'center', padding: 24, maxWidth: 400, margin: '0 auto' }}>
    <div style={{ fontSize: 28, marginBottom: 8 }}>⚡</div>
    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
      {totalPages
        ? `${totalPages} pages found — upgrade to process all`
        : 'OCR found text — unlock to download'}
    </div>
    <div style={{ fontSize: 13, color: '#52606b', marginBottom: 16, lineHeight: 1.5 }}>
      {totalPages
        ? `Free plan processes ${freePages} pages. Upgrade to Pro for all ${totalPages} pages.`
        : 'Upgrade to Pro to download the full OCR result.'}
    </div>

    {/* Trial-first CTA */}
    {trialState.trialAvailable && (
      <button onClick={handleStartTrial} style={primaryBtnStyle}>
        Start free trial — 3 days, no card
      </button>
    )}
    <button onClick={handleUpgrade} style={secondaryBtnStyle}>
      Upgrade to Pro — $3.99/mo
    </button>
  </div>
```

**Изменение:** Передать `totalPages` из controller

В строке 760:
```tsx
<OcrPaywallOverlay
  content={ctrl.ocrResult.content || ''}
  pages={ctrl.previewPages}
  totalPages={ctrl.totalPageCount}
/>
```

### 3. `src/app/platform/daily-usage.ts`

**Изменение:** Убрать OCR из дневного лимита

```typescript
export const FREE_TOOL_DAILY_LIMITS: Record<string, number> = {
  'compress-pdf': 3,
  'pdf-to-jpg': 3,
  'extract-images': 3,
  // 'ocr-pdf': 3,  ← УБРАТЬ — теперь лимит 3 стр. за запуск
  'text': 3,
  // ... остальное без изменений
};
```

Также обновить логику в `StudioShell.tsx` (строка 418-429), где проверяется дневной лимит для OCR — убрать OCR из этой проверки, так как лимит теперь на уровне страниц.

### 4. `src/v6/components/Studio/StudioShell.tsx`

**Изменение:** Убрать paywall для OCR из дневного лимита

Строки 417-429 проверяют дневной лимит для всех free tools. Для OCR этот paywall больше не нужен — лимит теперь на уровне страниц в controller.

```typescript
// Строка 418: убрать 'ocr-pdf' из проверки
const dailyLimit = FREE_TOOL_DAILY_LIMITS[tool];
if (dailyLimit !== undefined && billingContext.plan === 'basic' && tool !== 'ocr-pdf') {
  // ... existing logic
}
```

## Верификация

1. `npm run build` — чистая сборка
2. `npm run audit:workerization:strict` — без регрессий
3. Manual test:
   - Загрузить 10-страничный PDF
   - Запустить OCR → получить результат для 3 страниц
   - Видеть paywall: "10 pages found — upgrade to process all 10"
   - Нажать "Start free trial" → trial стартует, OCR обрабатывает все 10 страниц
   - Повторить без trial → снова 3 страницы
4. Telemetry: `paywall_shown` с `trigger: 'ocr_trial_limit'`

## Не трогаем

- Остальные инструменты (compress, pdf-to-jpg и т.д.) — их дневной лимит остаётся
- Pro пользователи — без изменений
- Trial flow — существующий trial-manager работает как есть
