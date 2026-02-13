import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { usePlatform } from '../../../app/react/platform-context';
import { LinearIcon } from '../../../v6/components/icons/linear-icon';

interface ExcelToPdfConfigProps {
  inputFiles: string[];
  onStart: (options: Record<string, unknown>) => void;
  onBack: () => void;
  onPickFiles?: (files: File[]) => void | Promise<void>;
  onClearFiles?: () => void | Promise<void>;
}

export default function ExcelToPdfConfig({
  inputFiles,
  onStart,
  onBack,
  onPickFiles,
  onClearFiles,
}: ExcelToPdfConfigProps) {
  const { runtime } = usePlatform();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'pdf' | 'details'>('pdf');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [scaling, setScaling] = useState<'one-page' | 'fit-columns' | 'none'>('one-page');
  const [range, setRange] = useState<'workbook' | 'active-sheet'>('workbook');
  const [showGrid, setShowGrid] = useState(true);

  useEffect(() => {
    const loadNames = async () => {
      const names = await Promise.all(
        inputFiles.map(async (id) => {
          const entry = await runtime.vfs.read(id);
          return entry.getName();
        }),
      );
      setFileNames(names);
    };
    void loadNames();
  }, [inputFiles, runtime.vfs]);

  const primaryName = fileNames[0] ?? 'No file selected';
  const outputName = useMemo(() => {
    if (fileNames.length === 0) {
      return 'report.pdf';
    }
    const sourceName = fileNames[0];
    const dotIndex = sourceName.lastIndexOf('.');
    const baseName = dotIndex > 0 ? sourceName.slice(0, dotIndex) : sourceName;
    return `${baseName}.pdf`;
  }, [fileNames]);

  const canRun = fileNames.length > 0;

  const handleFileInput = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (files.length === 0 || !onPickFiles) {
      return;
    }
    await onPickFiles(files);
  };

  return (
    <div className="tool-config-root excel-concept-root">
      <div className="ocr-concept-workspace">
        <section className="tool-config-card ocr-concept-left excel-concept-left">
          <h3 className="excel-concept-title">Excel conversion</h3>

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
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style={{ display: 'none' }}
              onChange={(event) => {
                void handleFileInput(event);
              }}
            />
            <div className="ocr-concept-upload-icon">
              <LinearIcon name="excel" className="linear-icon icon-md" />
            </div>
            <p className="ocr-concept-upload-title">Drop table or click to upload</p>
            <p className="ocr-concept-upload-copy">XLS and XLSX. Local processing in browser runtime.</p>

            <div className="ocr-concept-file-chip">
              <span className="ocr-concept-file-name">{primaryName}</span>
              {fileNames.length > 0 && onClearFiles ? (
                <button
                  type="button"
                  className="ocr-concept-clear-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    void onClearFiles();
                  }}
                  aria-label="Clear selected files"
                >
                  <LinearIcon name="x" className="linear-icon" />
                </button>
              ) : (
                <LinearIcon name="refresh" className="linear-icon" />
              )}
            </div>
          </div>

          <div className="ocr-concept-settings">
            <label className="tool-config-label" htmlFor="excel-orientation">Page orientation</label>
            <select
              id="excel-orientation"
              className="tool-config-select"
              value={orientation}
              onChange={(event) => setOrientation(event.target.value === 'landscape' ? 'landscape' : 'portrait')}
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>

            <label className="tool-config-label" htmlFor="excel-scale">Scaling</label>
            <select
              id="excel-scale"
              className="tool-config-select"
              value={scaling}
              onChange={(event) => {
                const value = event.target.value;
                setScaling(value === 'fit-columns' || value === 'none' ? value : 'one-page');
              }}
            >
              <option value="one-page">Fit worksheet to one page</option>
              <option value="fit-columns">Fit all columns to width</option>
              <option value="none">No scaling</option>
            </select>

            <label className="tool-config-label" htmlFor="excel-range">Range</label>
            <select
              id="excel-range"
              className="tool-config-select"
              value={range}
              onChange={(event) => setRange(event.target.value === 'active-sheet' ? 'active-sheet' : 'workbook')}
            >
              <option value="workbook">Whole workbook</option>
              <option value="active-sheet">Active sheet only</option>
            </select>

            <label className="ocr-concept-check">
              <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
              Show table grid
            </label>
          </div>

          <div className="tool-config-actions ocr-concept-actions">
            <button className="btn-ghost" onClick={onBack}>
              Cancel
            </button>
            <button
              className="btn-primary btn-inline"
              disabled={!canRun}
              onClick={() => onStart({ orientation, scaling, range, showGrid })}
            >
              <LinearIcon name="play" className="linear-icon" />
              Convert to PDF
            </button>
          </div>
        </section>

        <section className="tool-config-card ocr-concept-right">
          {fileNames.length === 0 ? (
            <div className="ocr-concept-empty">
              <LinearIcon name="excel" className="linear-icon icon-md" />
              <h4 className="ocr-concept-empty-title">Excel to PDF</h4>
              <p className="ocr-concept-empty-copy">Upload a spreadsheet and check the PDF preview on the right.</p>
            </div>
          ) : (
            <>
              <div className="ocr-concept-tabs" role="tablist" aria-label="Excel preview tabs">
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
                  <div className={`excel-concept-pdf-page ${orientation === 'landscape' ? 'landscape' : ''}`}>
                    <div className="excel-concept-sheet-title" />
                    <table className={`excel-concept-table ${showGrid ? '' : 'no-grid'}`}>
                      <thead>
                        <tr>
                          <th><div className="excel-concept-cell-skel" /></th>
                          <th><div className="excel-concept-cell-skel" /></th>
                          <th><div className="excel-concept-cell-skel long" /></th>
                          <th><div className="excel-concept-cell-skel" /></th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 4 }).map((_, rowIndex) => (
                          <tr key={rowIndex}>
                            <td><div className="excel-concept-cell-skel" /></td>
                            <td><div className="excel-concept-cell-skel" /></td>
                            <td><div className="excel-concept-cell-skel long" /></td>
                            <td><div className="excel-concept-cell-skel" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="excel-concept-chart">
                      <span className="excel-concept-bar h40" />
                      <span className="excel-concept-bar h70" />
                      <span className="excel-concept-bar h50" />
                      <span className="excel-concept-bar h90" />
                      <span className="excel-concept-bar h60" />
                    </div>
                  </div>
                ) : (
                  <pre className="ocr-concept-editor-copy">{`Input: ${primaryName}
Output: ${outputName}
Orientation: ${orientation}
Scaling: ${scaling}
Range: ${range}
Grid: ${showGrid ? 'shown' : 'hidden'}`}</pre>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
