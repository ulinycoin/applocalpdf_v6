import { useState, Suspense, lazy, type ComponentType } from 'react';
import { usePlatform } from '../platform-context';
import { useToolExecution } from '../use-tool-execution';
import { ProcessingStage } from './stages/processing-stage';
import { ResultStage } from './stages/result-stage';
import type { ToolRunContext } from '../../../core/public/contracts';

interface WizardShellProps {
    toolId: string;
}

const demoContext: ToolRunContext = {
    userId: 'demo-user',
    plan: 'pro' as const,
    entitlements: [
        'pdf.merge',
        'pdf.split',
        'pdf.compress',
        'pdf.ocr',
        'pdf.rotate',
        'pdf.delete_pages',
        'pdf.edit',
        'pdf.to_image',
        'office.convert',
        'pdf.protect.encrypt',
        'pdf.protect.unlock',
    ],
};

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

export function WizardShell({ toolId }: WizardShellProps) {
    const { runtime } = usePlatform();
    const [step, setStep] = useState<WizardStep>('config');
    const [inputIds, setInputIds] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const { execute, progress, statusMessage, lastResult } = useToolExecution(toolId, demoContext);

    const toolDef = runtime.registry.get(toolId);
    const ToolConfigUI = lazy(toolDef.uiLoader) as unknown as ComponentType<ToolConfigProps>;

    const handleStart = async (configOptions: Record<string, unknown>) => {
        const finalInputIds = (configOptions.inputIds as string[]) || inputIds;
        setStep('processing');

        const result = await execute({
            inputIds: finalInputIds,
            options: configOptions,
        });

        if (result.type === 'TOOL_RESULT') {
            setStep('result');
        } else if (result.type === 'TOOL_ERROR') {
            setError(result.message);
            setStep('config');
        } else if (result.type === 'TOOL_ACCESS_DENIED') {
            setError(result.details || 'Access denied');
            setStep('config');
        }
    };

    const handleRestart = () => {
        setStep('config');
        setInputIds([]);
        setError(null);
    };

    return (
        <div className="wz-page">
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
                    onRestart={handleRestart}
                />
            )}
        </div>
    );
}
