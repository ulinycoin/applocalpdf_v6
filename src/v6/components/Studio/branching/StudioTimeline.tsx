import { useEffect, useRef } from 'react';
import { useHistoryStore } from '../store/history-store';
import { LinearIcon } from '../../icons/linear-icon';

function formatDistanceToNow(timestamp: number): string {
    const diff = Math.max(0, Date.now() - timestamp);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
}

export function StudioTimeline() {
    const timeline = useHistoryStore((s) => s.timeline);
    const historyIndex = useHistoryStore((s) => s.historyIndex);
    const restoreCheckpoint = useHistoryStore((s) => s.restoreCheckpoint);
    
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new event
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [timeline.length]);

    if (timeline.length === 0) {
        return (
            <div className="studio-timeline empty">
                <LinearIcon name="history" className="linear-icon-large opacity-50 mb-4" />
                <p>History is empty.</p>
                <span className="text-xs opacity-60">Actions will appear here.</span>
            </div>
        );
    }

    return (
        <div className="studio-timeline-container" ref={containerRef}>
            <div className="studio-timeline-header">
                <h3>Version History</h3>
            </div>
            <div className="studio-timeline-list">
                {timeline.map((event, index) => {
                    const isCurrent = index === historyIndex;
                    const isFuture = index > historyIndex;
                    const isCheckpoint = !!event.snapshot;

                    return (
                        <div 
                            key={event.id}
                            className={`timeline-item ${isCurrent ? 'current' : ''} ${isFuture ? 'future' : ''} ${isCheckpoint ? 'checkpoint' : 'event'}`}
                        >
                            <div className="timeline-marker">
                                <div className="timeline-dot" />
                                {index < timeline.length - 1 && <div className="timeline-line" />}
                            </div>
                            <div className="timeline-content">
                                <div className="timeline-label">
                                    <span className="timeline-type">{event.type.replace('_', ' ').toUpperCase()}</span>
                                    <span className="timeline-text">{event.label}</span>
                                    {event.isManualVersion && <span className="timeline-version-badge">Version</span>}
                                </div>
                                <div className="timeline-meta">
                                    {formatDistanceToNow(event.timestamp)}
                                </div>
                                {isCheckpoint && !isCurrent && (
                                    <button 
                                        type="button"
                                        className="timeline-restore-btn"
                                        onClick={() => restoreCheckpoint(index)}
                                    >
                                        Restore
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
