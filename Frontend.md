Роль: Senior Frontend Architect (React, TypeScript, FSD Architecture). Стек: React 18+, TypeScript 5, Vite, Tailwind CSS (Glassmorphism), Framer Motion.
Контекст: Мы переписываем приложение LocalPDF на архитектуру V6.
• Legacy: Монолитные компоненты, блокирующие UI.
• V6:
    1. VFS First: UI никогда не хранит File или Blob. Только fileId (UUID строка).
    2. Worker Orchestrator: Тяжелая логика только в WebWorker.
    3. Registry: Конфигурация инструмента (IToolDefinition) загружается динамически.
Задача: Реализовать компонент WizardShell.tsx и хук useWizardFlow.ts. Это стейт-машина, управляющая 4 этапами работы инструмента («Режим Фокусировки»).
Требования к логике (State Machine):
1. Stage 1: Upload (The Gate)
    ◦ Использовать SmartUploadZone.
    ◦ Critical: При дропе файлов сразу писать их в VFS (vfs.write).
    ◦ Edge Case: Если VFS выбросила QuotaExceededError -> показать Toast с ошибкой, не менять стейт.
    ◦ Validation: Сразу после записи вызвать limitService.check(toolDef.limits). Если fail -> показать Upsell Modal -> удалить файлы из VFS -> сброс.
2. Stage 2: Config (Polymorphic)
    ◦ Загрузить компонент настроек через toolDef.uiLoader.
    ◦ Передать ему пропсы IToolConfigProps (где inputFiles — это string[] ID, а не Blobs).
    ◦ Edge Case: Если uiLoader упал (сеть), показать ErrorBoundary с кнопкой "Retry".
3. Stage 3: Processing (Dynamic Island)
    ◦ Отправить команду PROCESS_TOOL в UnifiedRunner.
    ◦ Слушать события: PROGRESS (обновлять бар), ERROR (показать алерт), RESULT (переход на финиш).
    ◦ Реализовать "отмену" через AbortController.
4. Stage 4: Result
    ◦ Кнопка скачивания вызывает абстракцию IOAdapter.save(fileId).
Формат ответа (Strict Output Format): Ответ должен содержать только Markdown с fenced code blocks. Никакой "воды" и вступительных слов. Структура файлов:
1. src/v6/components/Wizard/types.ts (Интерфейсы пропсов и стейта)
2. src/v6/hooks/useWizardFlow.ts (Логика машины состояний)
3. src/v6/components/Wizard/WizardShell.tsx (Верстка с анимациями)
Code Style & Few-Shot Example: Используй строгую типизацию, именованные экспорты и guard clauses. Обрабатывай loading и error состояния явно.
Пример ожидаемого стиля хука:
export function useWizardFlow(toolId: string) {
  const [state, setState] = useState<WizardState>({ step: 'upload' });
  const runner = useUnifiedRunner();

  const handleFilesAdded = async (files: File[]) => {
    try {
      setState({ step: 'validating' });
      const fileIds = await vfs.writeBatch(files); // VFS first!
      
      const limits = registry.getLimits(toolId);
      const access = await limitService.validate(fileIds, limits);

      if (!access.allowed) {
        await vfs.deleteBatch(fileIds); // Cleanup immediately
        return setState({ step: 'upload', error: access.reason });
      }

      setState({ step: 'config', fileIds });
    } catch (err) {
      console.error('VFS Write Failed', err);
      setState({ step: 'upload', error: 'Storage quota exceeded' });
    }
  };

  return { state, handleFilesAdded, /* ... */ };
}
UX Requirements:
• Используй <AnimatePresence> для плавного перехода между шагами (opacity: 0 -> opacity: 1).
• Стиль: Glassmorphism (bg-white/10 backdrop-blur-md).

## UI/UX 2026 References
- Решения по стилю/микрокопирайту/иконографии: `docs/UI_UX_2026_DECISIONS.md`.
- Снимок прогресса и quality-gates: `docs/PROGRESS_LOG_2026-02-09.md`.
