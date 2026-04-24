import { usePlatform } from '../../platform-context';
import { downloadOutputFiles } from '../../../platform/download-output-files';
import { getOrCreateFlowId } from '../../../platform/browser-context';

interface ResultStageProps {
    outputIds: string[];
    baseName?: string;
    onRestart: () => void;
}

const ALSO_TRY = [
    {
        label: 'Compress PDF',
        icon: (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
                <line x1="10" y1="14" x2="21" y2="3"/><line x1="3" y1="21" x2="14" y2="10"/>
            </svg>
        ),
    },
    {
        label: 'PDF to JPG',
        icon: (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
            </svg>
        ),
    },
    {
        label: 'Protect PDF',
        icon: (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
        ),
    },
    {
        label: 'Merge PDF',
        icon: (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
        ),
    },
];

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
        <div className="wz-stage-fade">
            <div className="wz-card">
                {/* Success hero */}
                <div className="wz-result-hero">
                    <div className="wz-result-check">✓</div>
                    <div className="wz-result-title">Done</div>
                    <div className="wz-result-sub">
                        {outputIds.length} file{outputIds.length !== 1 ? 's' : ''} processed · ready for download
                    </div>
                </div>

                {/* Output file row */}
                <div className="wz-output-row">
                    <div className="wz-output-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f7b6c" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                    </div>
                    <div>
                        <div className="wz-output-name">
                            {outputIds.length} file{outputIds.length !== 1 ? 's' : ''} generated
                        </div>
                        <div className="wz-output-meta">Ready for download from local workspace</div>
                    </div>
                    <button className="wz-btn-download" onClick={handleDownload}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Download
                    </button>
                </div>

                {/* Actions */}
                <div className="wz-result-actions">
                    <button className="wz-btn wz-btn-ghost" onClick={onRestart}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <polyline points="1 4 1 10 7 10"/>
                            <path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
                        </svg>
                        Run again
                    </button>
                    <button className="wz-btn wz-btn-ghost" style={{ marginLeft: 'auto' }} onClick={onRestart}>
                        ← Back to Studio
                    </button>
                </div>
            </div>

            {/* Also try */}
            <div className="wz-also-try">
                <div className="wz-also-try-label">Also try</div>
                <div className="wz-also-try-list">
                    {ALSO_TRY.map((item) => (
                        <div key={item.label} className="wz-also-try-item">
                            {item.icon}
                            {item.label}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
