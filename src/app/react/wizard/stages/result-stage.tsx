import { usePlatform } from '../../platform-context';
import { downloadOutputFiles } from '../../../platform/download-output-files';
import { getOrCreateFlowId } from '../../../platform/browser-context';

interface ResultStageProps {
    outputIds: string[];
    baseName?: string;
    onRestart: () => void;
}

export function ResultStage({ outputIds, baseName = 'result', onRestart }: ResultStageProps) {
    const { runtime } = usePlatform();

    const handleDownload = async () => {
        runtime.telemetry.track({
            type: 'OUTPUT_DOWNLOADED',
            flowId: getOrCreateFlowId(),
            toolId: 'wizard',
            outputCount: outputIds.length,
            surface: 'wizard',
        });
        await downloadOutputFiles(runtime, outputIds, { baseName });
    };

    return (
        <div className="animate-fade-in wizard-result-stage" style={{ textAlign: 'center' }}>
            <div className="wizard-result-mark" aria-hidden="true">
                ✓
            </div>
            <h2 className="stage-title">All Done!</h2>
            <p className="stage-description">
                Your file has been successfully processed and is ready for download.
            </p>

            <div className="wizard-output-card">
                <div className="wizard-output-row">
                    <div className="wizard-output-file-icon" aria-hidden="true">⋯</div>
                    <div className="wizard-output-file-meta">
                        <p className="wizard-output-label">
                            {outputIds.length} file{outputIds.length > 1 ? 's' : ''} generated
                        </p>
                        <p className="wizard-output-hint">Ready for download from the local workspace.</p>
                    </div>
                </div>

                <div className="wizard-action-row wizard-result-actions">
                    <button className="btn-primary wizard-download-btn" onClick={handleDownload}>
                        Download
                    </button>
                    <button className="btn-ghost" onClick={onRestart}>
                        Run again
                    </button>
                    <button className="btn-ghost" onClick={onRestart}>
                        Back to Studio
                    </button>
                </div>
            </div>
        </div>
    );
}
