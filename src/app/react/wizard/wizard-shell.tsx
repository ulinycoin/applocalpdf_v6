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
    plan: 'pro' as const, // For demo, assuming PRO. In real app, comes from auth/billing context.
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
            setStep('config'); // Return to config on error
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
        <div className="wizard-container">
            <div className="wizard-header">
                <div className="wizard-tool-header">
                    <div className="wizard-tool-icon" aria-hidden="true">
                        {toolDef.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="wizard-tool-copy">
                        <h1 className="wizard-title">{toolDef.name}</h1>
                        <p className="wizard-subtitle">{toolDef.description}</p>
                    </div>
                </div>
                <span className="wizard-privacy-badge">Private</span>
            </div>

            <div className="wizard-progress-track" aria-hidden="true">
                <div
                    className="wizard-progress-bar wizard-progress-bar--shimmer"
                    style={{ width: step === 'config' ? '33%' : step === 'processing' ? '66%' : '100%' }}
                />
            </div>

            {error && (
                <div style={{
                    backgroundColor: 'var(--green-bg)',
                    color: 'var(--text)',
                    padding: '1rem',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    fontSize: '0.875rem',
                    border: '1px solid rgba(15,123,108,0.15)'
                }}>
                    <strong style={{ color: 'var(--red)' }}>Error:</strong> {error}
                </div>
            )}

            {step === 'config' && (
                <div className="animate-fade-in">
                    <h2 className="stage-title">Configure {toolDef.name}</h2>
                    <p className="stage-description">Adjust settings before processing.</p>
                    <Suspense fallback={<div>Loading options...</div>}>
                        {/* 
                We pass handleStart and inputIds to the Tool UI. 
                Existing Tool UIs will need refactoring to match this interface.
            */}
                        <ToolConfigUI
                            inputIds={inputIds}
                            onStart={handleStart}
                            onCancel={handleRestart}
                        />
                    </Suspense>
                </div>
            )}

            {step === 'processing' && (
                <ProcessingStage
                    progress={progress}
                    statusMessage={statusMessage}
                    onCancel={handleRestart}
                />
            )}

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
