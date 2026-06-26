# Paywall → Checkout Conversion: 3.8% → 15%+

## Проблема

53 paywall_shown/нед → 2 paywall_cta_clicked → 2 checkout_opened. Конверсия CTA: 3.8%.

**Корень:** PaywallModal показывает generic "Studio Tool" с 8-ю фичами, trial не подключен, копия слабая.

## Решение: 3 изменения

### 1. Персонализация PaywallModal ( main impact)

**Файл:** `src/app/react/PaywallModal.tsx`

- Добавить проп `trigger` (enum: `daily_limit | workspace_limit | page_limit | generic`)
- Добавить проп `toolName` (реальное имя инструмента, не "Studio Tool")
- Копия по контексту:

| trigger | Title | Subtitle |
|---------|-------|----------|
| `daily_limit` | `{ToolName} — лимит исчерпан` | `Вы использовали все {n} бесплатных запусков сегодня. Pro — без ограничений.` |
| `workspace_limit` | `Лимит рабочих пространств` | `Free включает до 3 пространств. Pro — без ограничений.` |
| `page_limit` | `Документ слишком большой` | `Ваш документ ({n} стр.) превышает лимит 25 страниц. Pro — без ограничений.` |
| `generic` | `Откройте эту функцию` | `Pro даёт доступ ко всем инструментам и функциям.` |

### 2. Trial-first CTA

**Файлы:** `PaywallModal.tsx`, `StudioConvertWorkspace.tsx`

Добавить trial-first логику (уже есть в `ux-feedback-overlay.tsx`):

```
if trialState.trialAvailable:
  Primary: "Start free trial — 3 days, no card"
  Secondary: "Upgrade to Pro — $3.99/mo" (text link)
elif trialState.isActive:
  Primary: "Upgrade to Pro — $3.99/mo"
  Secondary: "Continue trial" (ghost)
else:
  Primary: "Upgrade to Pro — $3.99/mo"
```

Импорты: `getTrialState`, `startTrial` из `trial-manager.ts`, `handleTrialStart` из `studio-paywall.ts`.

### 3. Передача контекста из StudioShell

**Файл:** `src/v6/components/Studio/StudioShell.tsx`

Добавить состояние `paywallTrigger` наряду с `paywallReason`. Обновить 5 мест вызова `showStudioPaywall()`:

| Строка | Текущий вызов | Новый trigger |
|--------|---------------|---------------|
| 422 | `showStudioPaywall(telemetry, "You've used all 3 free {tool} runs...")` | `{ trigger: 'daily_limit', toolName: tool }` |
| 452 | `showStudioPaywall(telemetry, "Free includes up to 3 workspaces...")` | `{ trigger: 'workspace_limit' }` |
| 595 | `showStudioPaywall(telemetry, "Free includes up to 3 workspaces...")` | `{ trigger: 'workspace_limit' }` |
| 780 | `showStudioPaywall(telemetry, "Free supports documents up to 25 pages...")` | `{ trigger: 'page_limit' }` |
| 932 | `showStudioPaywall(telemetry, "Free includes up to 3 workspaces...")` | `{ trigger: 'workspace_limit' }` |
| 944 | `showStudioPaywall(telemetry, "Free supports documents up to 25 pages...")` | `{ trigger: 'page_limit' }` |

Передать в PaywallModal:
```tsx
<PaywallModal
  toolId="studio"
  toolName={paywallTrigger?.toolName ?? 'Studio'}
  trigger={paywallTrigger?.trigger ?? 'generic'}
  details={paywallReason}
  onClose={() => { setPaywallReason(null); setPaywallTrigger(null); }}
/>
```

### 4. ОcrPaywallOverlay — trial-first CTA

**Файл:** `src/v6/components/Studio/convert/StudioConvertWorkspace.tsx` (строки 61-183)

Добавить trial-first CTA в `OcrPaywallOverlay`:

```tsx
const trialState = getTrialState();

// Primary: Start free trial
{trialState.trialAvailable && (
  <button onClick={handleTrial} style={...}>
    Start free trial — 3 days, no card
  </button>
)}

// Secondary: Direct upgrade
<button onClick={handleUpgrade} style={...}>
  Upgrade to Pro — $3.99/mo
</button>
```

### 5. CSS дополнения

**Файл:** `src/styles.css` (после .paywall-note, ~строка 7257)

```css
.paywall-skip-trial {
  display: block;
  margin: 10px auto 0;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
}
```

## Файлы для изменения

| Файл | Что менять |
|------|-----------|
| `src/app/react/PaywallModal.tsx` | Проп trigger, персональная копия, trial-first CTA |
| `src/v6/components/Studio/StudioShell.tsx` | Состояние paywallTrigger, передача контекста в 6 местах |
| `src/v6/components/Studio/convert/StudioConvertWorkspace.tsx` | Trial-first CTA в OcrPaywallOverlay |
| `src/styles.css` | Класс .paywall-skip-trial |

## Не трогаем

- `ux-feedback-overlay.tsx` — уже имеет trial-first паттерн, работает нормально
- `studio-paywall.ts` — менять не нужно, он уже передаёт нужные данные
- `billing.ts` — checkout flow работает, не трогаем
- `trial-manager.ts` — trial логика уже полная

## Верификация

1. `npm run build` — чистая сборка
2. `npm run audit:workerization:strict` — без регрессий
3. Manual: Hit daily limit → verify personalized modal + trial CTA
4. Manual: Hit workspace limit → verify workspace-specific copy
5. Manual: Start trial from paywall → verify tools unlock
6. Manual: Run OCR → verify blurred preview + trial CTA
7. Manual: Trial used → verify only "Upgrade to Pro" shows
8. Telemetry: Verify `paywall_shown` includes trigger context
