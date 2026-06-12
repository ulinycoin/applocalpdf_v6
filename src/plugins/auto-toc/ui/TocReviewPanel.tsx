import { useCallback, useState } from 'react';
import { LinearIcon } from '../../../v6/components/icons/linear-icon';
import { TocTree } from './TocTree';
import type { HeaderNode } from '../logic/index';

export interface ApplyOptions {
    headers: HeaderNode[];
    generateTocPage: boolean;
}

interface TocReviewPanelProps {
  headers: HeaderNode[];
  bodyTextSize: number | null;
  headingCandidatesFound: number;
  totalSpansExtracted: number;
  onHeadersChange: (headers: HeaderNode[]) => void;
  onApply: (options: ApplyOptions) => void;
  onBack: () => void;
  isProcessing?: boolean;
}

export function TocReviewPanel({
  headers,
  bodyTextSize,
  headingCandidatesFound,
  totalSpansExtracted: _totalSpansExtracted,
  onHeadersChange,
  onApply,
  onBack,
  isProcessing,
}: TocReviewPanelProps) {
  const [generateTocPage, setGenerateTocPage] = useState(false);
  const enabledCount = headers.filter((h) => h.enabled).length;

  const handleApply = useCallback(() => {
    onApply({ headers: headers.filter((h) => h.enabled), generateTocPage });
  }, [headers, onApply, generateTocPage]);

  return (
    <div className="tool-config-root toc-review-root">
      <div className="toc-review-header">
        <div className="toc-review-header-top">
          <h3 className="toc-review-title">Review Headings</h3>
          <div className="toc-review-stats">
            <div className="toc-review-stat">
              <span className="toc-review-stat-value">{headingCandidatesFound}</span>
              <span className="toc-review-stat-label">found</span>
            </div>
            <div className="toc-review-stat">
              <span className="toc-review-stat-value">{enabledCount}</span>
              <span className="toc-review-stat-label">enabled</span>
            </div>
            {bodyTextSize !== null && (
              <div className="toc-review-stat">
                <span className="toc-review-stat-value">{bodyTextSize.toFixed(1)}pt</span>
                <span className="toc-review-stat-label">body</span>
              </div>
            )}
          </div>
        </div>
        <p className="tool-config-copy">
          Review detected headings, edit text, adjust levels, and remove noise.
          Only checked items will be included.
        </p>
      </div>

      <div className="toc-review-body">
        <TocTree headers={headers} onChange={onHeadersChange} />
      </div>

      {/* Toggle: include a physical TOC page */}
      <label className="toc-option-row">
        <input
          type="checkbox"
          checked={generateTocPage}
          onChange={(e) => setGenerateTocPage(e.target.checked)}
          disabled={isProcessing}
        />
        <div className="toc-option-text">
          <strong>Add Table of Contents page</strong>
          <span>Inserts a clickable TOC page at the beginning of the document</span>
        </div>
      </label>

      <div className="tool-config-actions premium-actions toc-review-actions">
        <button className="btn-ghost" onClick={onBack} disabled={isProcessing}>
          <span className="btn-inline">
            <LinearIcon name="x" className="linear-icon" />
            Back
          </span>
        </button>
        <div className="toc-review-actions-right">
          <span className="toc-review-action-hint">
            {enabledCount} of {headers.length} heading{headers.length !== 1 ? 's' : ''}
          </span>
          <button
            className="btn-primary btn-premium-glow"
            onClick={handleApply}
            disabled={isProcessing || enabledCount === 0}
          >
            <span className="btn-inline">
              <LinearIcon name="check" className="linear-icon" />
              {isProcessing ? 'Applying...' : 'Apply to PDF'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
