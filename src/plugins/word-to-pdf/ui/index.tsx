import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { usePlatform } from '../../../app/react/platform-context';
import { LinearIcon } from '../../../v6/components/icons/linear-icon';

interface WordToPdfConfigProps {
  inputFiles: string[];
  onStart: (options: Record<string, unknown>) => void;
  onBack: () => void;
  onPickFiles?: (files: File[]) => void | Promise<void>;
  onClearFiles?: () => void | Promise<void>;
}

export default function WordToPdfConfig({
  inputFiles,
  onStart,
  onBack,
  onPickFiles,
  onClearFiles,
}: WordToPdfConfigProps) {
  const { runtime } = usePlatform();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'pdf' | 'details'>('pdf');
  const [quality, setQuality] = useState<'standard' | 'high' | 'min'>('standard');
  const [pdfA, setPdfA] = useState(false);
  const [protectWithPassword, setProtectWithPassword] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    const loadNames = async () => {
      const names = await Promise.all(
        inputFiles.map(async (id) => {
          const e = await runtime.vfs.read(id);
          return e.getName();
        }),
      );
      setFileNames(names);
    };
    void loadNames();
  }, [inputFiles, runtime.vfs]);

  const primaryName = fileNames[0] ?? 'No file selected';
  const outputName = useMemo(() => {
    if (fileNames.length === 0) {
      return 'converted.pdf';
    }
    const sourceName = fileNames[0];
    const dotIndex = sourceName.lastIndexOf('.');
    const baseName = dotIndex > 0 ? sourceName.slice(0, dotIndex) : sourceName;
    return `${baseName}.pdf`;
  }, [fileNames]);

  const canRun = fileNames.length > 0 && (!protectWithPassword || password.trim().length > 0);

  const handleFileInput = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (files.length === 0 || !onPickFiles) {
      return;
    }
    await onPickFiles(files);
  };

  return (
    <div className="tool-config-root word-concept-root">
      <div className="ocr-concept-workspace">
        <section className="tool-config-card ocr-concept-left word-concept-left">
          <h3 className="word-concept-title">Conversion settings</h3>

          <div
            className={`ocr-concept-upload ${onPickFiles ? '' : 'upload-readonly'}`}
            role={onPickFiles ? 'button' : undefined}
            tabIndex={onPickFiles ? 0 : -1}
            onClick={() => {
              if (onPickFiles) {
                inputRef.current?.click();
              }
            }}
            onKeyDown={(event) => {
              if (!onPickFiles) {
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: 'none' }}
              onChange={(event) => {
                void handleFileInput(event);
              }}
            />
            <span className="ocr-concept-upload-icon" aria-hidden="true">
              <LinearIcon name="word" className="linear-icon icon-md" />
            </span>
            <p className="ocr-concept-upload-title">Drop files or click to upload</p>
            <p className="ocr-concept-upload-copy">DOC and DOCX. Processing runs locally in browser.</p>
          </div>

          <div className="ocr-concept-file-chip">
            <div className="word-concept-file-name-group">
              <LinearIcon name="word" className="linear-icon" />
              <span className="ocr-concept-file-name">{primaryName}</span>
            </div>
            {fileNames.length > 0 && onClearFiles && (
              <button
                type="button"
                className="ocr-concept-clear-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  void onClearFiles();
                }}
                aria-label="Clear selected file"
              >
                <LinearIcon name="x" className="linear-icon" />
              </button>
          )}
          </div>

          <div className="ocr-concept-settings">
            <label className="tool-config-label" htmlFor="word-quality">Quality and size</label>
            <select
              id="word-quality"
              className="tool-config-select"
              value={quality}
              onChange={(event) => setQuality(event.target.value as 'standard' | 'high' | 'min')}
            >
              <option value="standard">Standard (screen and print)</option>
              <option value="high">High quality (print ready)</option>
              <option value="min">Minimum size (email)</option>
            </select>

            <div className="ocr-concept-checks">
              <label className="ocr-concept-check">
                <input type="checkbox" checked={pdfA} onChange={(event) => setPdfA(event.target.checked)} />
                Create PDF/A (archive mode)
              </label>

              <label className="ocr-concept-check">
                <input
                  type="checkbox"
                  checked={protectWithPassword}
                  onChange={(event) => setProtectWithPassword(event.target.checked)}
                />
                Protect with password
              </label>
            </div>

            {protectWithPassword && (
              <input
                className="tool-config-input"
                type="password"
                placeholder="Enter password to open PDF"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </div>

          <div className="tool-config-actions ocr-concept-actions">
            <button className="btn-ghost" onClick={onBack}>
              Cancel
            </button>
            <button
              className="btn-primary btn-inline"
              disabled={!canRun}
              onClick={() => onStart({ quality, pdfA, protectWithPassword, password: password.trim() })}
            >
              <LinearIcon name="play" className="linear-icon" />
              Convert to PDF
            </button>
          </div>
        </section>

        <section className="tool-config-card ocr-concept-right">
          {fileNames.length === 0 ? (
            <div className="ocr-concept-empty">
              <LinearIcon name="word" className="linear-icon icon-md" />
              <h4 className="ocr-concept-empty-title">Word to PDF</h4>
              <p className="ocr-concept-empty-copy">Upload a .docx document and review conversion preview on the right.</p>
            </div>
          ) : (
            <>
              <div className="ocr-concept-tabs" role="tablist" aria-label="Word preview tabs">
                <button
                  type="button"
                  className={`ocr-concept-tab ${activeTab === 'pdf' ? 'active' : ''}`}
                  onClick={() => setActiveTab('pdf')}
                >
                  PDF
                </button>
                <button
                  type="button"
                  className={`ocr-concept-tab ${activeTab === 'details' ? 'active' : ''}`}
                  onClick={() => setActiveTab('details')}
                >
                  Details
                </button>
              </div>

              <div className="ocr-concept-toolbar">
                <button type="button" className="ocr-concept-tool-btn" onClick={() => setActiveTab('pdf')}>
                  <LinearIcon name="refresh" className="linear-icon" />
                  Normalize view
                </button>
                <button type="button" className="ocr-concept-tool-btn ocr-concept-tool-btn-accent" disabled>
                  <LinearIcon name="download" className="linear-icon" />
                  Download
                </button>
              </div>

              <div className="ocr-concept-editor">
                {activeTab === 'pdf' ? (
                  <div className="word-concept-pdf-page">
                    <div className="word-concept-header-skeleton" />
                    <div className="word-concept-skeleton-line w-100" />
                    <div className="word-concept-skeleton-line w-100" />
                    <div className="word-concept-skeleton-line w-80" />
                    <div className="word-concept-skeleton-spacer" />
                    <div className="word-concept-skeleton-line w-100" />
                    <div className="word-concept-skeleton-line w-60" />
                    <div className="word-concept-table-skeleton" />
                    <div className="word-concept-skeleton-line w-100" />
                    <div className="word-concept-skeleton-line w-100" />
                  </div>
                ) : (
                  <pre className="ocr-concept-editor-copy">{`Input: ${primaryName}
Output: ${outputName}
Quality: ${quality}
PDF/A: ${pdfA ? 'enabled' : 'disabled'}
Password protection: ${protectWithPassword ? 'enabled' : 'disabled'}`}</pre>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
