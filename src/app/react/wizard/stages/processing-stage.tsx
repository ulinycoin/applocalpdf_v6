interface ProcessingStageProps {
    progress: number;
    statusMessage?: string;
    onCancel?: () => void;
}

export function ProcessingStage({ progress, statusMessage, onCancel }: ProcessingStageProps) {
    return (
        <div className="animate-fade-in wizard-stage" style={{ textAlign: 'center' }}>
            <h2 className="stage-title">Processing...</h2>
            <p className="stage-description">
                {statusMessage || 'Analyzing and processing your files locally.'}
            </p>

            <div className="wizard-processing-meter">
                <div
                    className="wizard-progress-track"
                    style={{ marginTop: 0 }}
                >
                    <div
                        className="wizard-progress-bar wizard-progress-bar--shimmer"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <p className="wizard-progress-value">{progress}%</p>
            </div>

            <div className="wizard-status-card">
                <div className="wizard-status-row">
                    <div className="wizard-spinner" />
                    <span>Worker is executing in private sandbox</span>
                </div>
            </div>
            <p className="wizard-privacy-note">0 bytes sent to server</p>

            {onCancel && (
                <div style={{ marginTop: '1.5rem' }}>
                    <button
                        className="btn-ghost"
                        onClick={onCancel}
                    >
                        Cancel Task
                    </button>
                </div>
            )}
        </div>
    );
}
