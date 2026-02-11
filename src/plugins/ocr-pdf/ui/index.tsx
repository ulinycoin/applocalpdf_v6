import { useEffect, useState } from 'react';
import { usePlatform } from '../../../app/react/platform-context';

interface OcrPdfConfigProps {
  inputFiles: string[];
  onStart: (options: Record<string, unknown>) => void;
  onBack: () => void;
}

export default function OcrPdfConfig({ inputFiles, onStart, onBack }: OcrPdfConfigProps) {
  const { runtime } = usePlatform();
  const [fileName, setFileName] = useState<string>('');

  useEffect(() => {
    if (inputFiles.length > 0) {
      void runtime.vfs.read(inputFiles[0]).then((e) => setFileName(e.getName()));
    }
  }, [inputFiles, runtime.vfs]);

  return (
    <div className="tool-config-root">
      <p className="tool-config-copy">
        Ready to recognize text in <strong>{fileName || 'selected file'}</strong>. This process will analyze the document and
        extract all available text.
      </p>

      <div className="tool-config-card">
        <p className="tool-config-copy" style={{ margin: 0 }}>
          OCR uses Tesseract.js engine and runs entirely in your browser.
        </p>
      </div>

      <div className="tool-config-actions">
        <button className="btn-ghost" onClick={onBack}>
          Cancel
        </button>
        <button className="btn-primary" onClick={() => onStart({})}>
          Run OCR
        </button>
      </div>
    </div>
  );
}
