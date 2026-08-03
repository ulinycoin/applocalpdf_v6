import { useState, Suspense, lazy, type ComponentType } from 'react';
import { usePlatform } from '../platform-context';
import { useToolExecution } from '../use-tool-execution';
import { ProcessingStage } from './stages/processing-stage';
import { ResultStage } from './stages/result-stage';
import { PaywallModal } from '../PaywallModal';
import type { ToolRunContext } from '../../../core/public/contracts';

interface WizardShellProps {
    toolId: string;
}

export type WizardStep = 'upload' | 'config' | 'processing' | 'result';

interface ToolConfigProps {
    inputIds: string[];
    onStart: (configOptions: Record<string, unknown>) => void;
    onCancel: () => void;
}

function StepIndicator({ step }: { step: WizardStep }) {
    const idx = step === 'config' ? 0 : step === 'processing' ? 1 : 2;
    const steps = ['Configure', 'Processing', 'Result'];

    return (
        <div className="wz-steps">
            {steps.map((label, i) => {
                const done = i < idx;
                const active = i === idx;
                return (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                        <div className={`wz-step${active ? ' wz-step--active' : done ? ' wz-step--done' : ''}`}>
                            <div className="wz-step-num">
                                {done ? '✓' : i + 1}
                            </div>
                            <span className="wz-step-label">{label}</span>
                        </div>
                        {i < steps.length - 1 && (
                            <div className={`wz-step-line${done ? ' wz-step-line--done' : ''}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Daily usage tracker for free-tier tools.
 * Stores a counter per tool in localStorage, resets each calendar day.
 */
function getDailyUsage(toolId: string): number {
    try {
        const key = `localpdf_usage_${toolId}`;
        const raw = localStorage.getItem(key);
        if (!raw) return 0;
        const { date, count } = JSON.parse(raw);
        const today = new Date().toISOString().slice(0, 10);
        return date === today ? count : 0;
    } catch {
        return 0;
    }
}

function incrementDailyUsage(toolId: string): void {
    try {
        const key = `localpdf_usage_${toolId}`;
        const today = new Date().toISOString().slice(0, 10);
        localStorage.setItem(key, JSON.stringify({ date: today, count: getDailyUsage(toolId) + 1 }));
    } catch {
        // Best-effort
    }
}

/** Maximum daily free uses per tool */
const DAILY_FREE_LIMIT: Record<string, number> = {
    'compress-pdf': 3,
    'merge-pdf': 3,
    'split-pdf': 3,
    'ocr-pdf': 3,
};

export function WizardShell({ toolId }: WizardShellProps) {
    const { runtime } = usePlatform();
    const [step, setStep] = useState<WizardStep>('config');
    const [inputIds, setInputIds] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [paywall, setPaywall] = useState<{ reason: string; details?: string } | null>(null);

    // Use the real billing context instead of hardcoded demoContext
    const context: ToolRunContext = runtime.billing.getContext();

    const { execute, progress, statusMessage, lastResult } = useToolExecution(toolId, context);

    const toolDef = runtime.registry.get(toolId);
    const ToolConfigUI = lazy(toolDef.uiLoader) as unknown as ComponentType<ToolConfigProps>;

    const handleStart = async (configOptions: Record<string, unknown>) => {
        // Check daily free limit BEFORE execution
        const dailyLimit = DAILY_FREE_LIMIT[toolId];
        if (dailyLimit !== undefined && context.plan === 'basic') {
            const used = getDailyUsage(toolId);
            if (used >= dailyLimit) {
                setPaywall({
                    reason: 'DAILY_LIMIT_EXCEEDED',
                    details: `You've used all ${dailyLimit} free compressions today. Upgrade to Pro for unlimited use.`,
                });
                return;
            }
        }

        const finalInputIds = (configOptions.inputIds as string[]) || inputIds;
        setStep('processing');

        const result = await execute({
            inputIds: finalInputIds,
            options: configOptions,
        });

        if (result.type === 'TOOL_RESULT') {
            // Track usage for free-tier tools
            if (DAILY_FREE_LIMIT[toolId] !== undefined && context.plan === 'basic') {
                incrementDailyUsage(toolId);
            }
            setStep('result');
        } else if (result.type === 'TOOL_ERROR') {
            setError(result.message);
            setStep('config');
        } else if (result.type === 'TOOL_ACCESS_DENIED') {
            setPaywall({
                reason: result.reason,
                details: result.details,
            });
            setStep('config');
        }
    };

    const handleRestart = () => {
        setStep('config');
        setInputIds([]);
        setError(null);
        setPaywall(null);
    };

    return (
        <div className="wz-page">
            {/* Paywall modal */}
            {paywall && (
                <PaywallModal
                    toolId={toolId}
                    toolName={toolDef.name}
                    reason={paywall.reason}
                    details={paywall.details}
                    onClose={() => setPaywall(null)}
                />
            )}

            {/* Tool header */}
            <div className="wz-tool-header">
                <div className="wz-tool-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                </div>
                <div>
                    <div className="wz-tool-title">{toolDef.name}</div>
                    <div className="wz-tool-desc">{toolDef.description}</div>
                    <div className="wz-tool-privacy">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                        Processed locally · files never leave your device
                    </div>
                    {context.plan === 'basic' && DAILY_FREE_LIMIT[toolId] !== undefined && (
                        <div className="wz-tool-usage">
                            Daily: {getDailyUsage(toolId)}/{DAILY_FREE_LIMIT[toolId]} free uses
                        </div>
                    )}
                </div>
            </div>

            {/* Step indicator */}
            <StepIndicator step={step} />

            {/* Error */}
            {error && (
                <div className="wz-error">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {/* Config stage */}
            {step === 'config' && (
                <div className="wz-stage-fade">
                    <Suspense fallback={<div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>}>
                        <ToolConfigUI
                            inputIds={inputIds}
                            onStart={handleStart}
                            onCancel={handleRestart}
                        />
                    </Suspense>
                </div>
            )}

            {/* Processing stage */}
            {step === 'processing' && (
                <ProcessingStage
                    progress={progress}
                    statusMessage={statusMessage}
                    onCancel={handleRestart}
                />
            )}

            {/* Result stage */}
            {step === 'result' && lastResult?.type === 'TOOL_RESULT' && (
                <ResultStage
                    outputIds={lastResult.outputIds}
                    baseName={toolId}
                    toolId={toolId}
                    onRestart={handleRestart}
                />
            )}
        </div>
    );
}
