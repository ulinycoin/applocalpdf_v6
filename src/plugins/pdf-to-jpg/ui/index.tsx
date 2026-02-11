interface PdfToJpgConfigProps {
  inputFiles: string[];
  onStart: (options: Record<string, unknown>) => void;
  onBack: () => void;
}

export default function PdfToJpgConfig({ inputFiles, onStart, onBack }: PdfToJpgConfigProps) {
  return (
    <div className="tool-config-root">
      <p className="tool-config-copy">
        Convert pages from <strong>{inputFiles.length}</strong> PDF file{inputFiles.length === 1 ? '' : 's'} into JPG images.
      </p>

      <div className="tool-config-card">
        <p className="tool-config-copy" style={{ margin: 0 }}>
          Each page will be exported as a separate image. Download all outputs on the result step.
        </p>
      </div>

      <div className="tool-config-actions">
        <button className="btn-ghost" onClick={onBack}>
          Cancel
        </button>
        <button className="btn-primary" onClick={() => onStart({})}>
          Run PDF to JPG
        </button>
      </div>
    </div>
  );
}
