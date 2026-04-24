interface ProcessingStageProps {
    progress: number;
    statusMessage?: string;
    onCancel?: () => void;
}

export function ProcessingStage({ progress, statusMessage, onCancel }: ProcessingStageProps) {
    return (
        <div className="wz-stage-fade">
            <div className="wz-card">
                <div className="wz-card-body" style={{ padding: '24px 20px' }}>
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5, color: 'var(--text)' }}>
                            Processing…
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                            Running in your browser. Your file stays on your device.
                        </div>
                    </div>

                    <div className="wz-progress-track">
                        <div
                            className="wz-progress-fill"
                            style={{ width: `${Math.max(2, progress)}%` }}
                        />
                    </div>

                    <div className="wz-progress-labels">
                        <span>{statusMessage || 'Preparing…'}</span>
                        <span className="wz-progress-pct">{Math.round(progress)}%</span>
                    </div>

                    <div className="wz-processing-note">
                        <div className="wz-spinner" />
                        Worker executing in private sandbox · 0 bytes sent to server
                    </div>

                    {onCancel && (
                        <div style={{ marginTop: 18 }}>
                            <button className="wz-btn wz-btn-ghost wz-btn-danger" onClick={onCancel}>
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
