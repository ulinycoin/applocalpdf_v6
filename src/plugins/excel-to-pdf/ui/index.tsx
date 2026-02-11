import { useEffect, useState } from 'react';
import { usePlatform } from '../../../app/react/platform-context';

interface ExcelToPdfConfigProps {
  inputFiles: string[];
  onStart: (options: Record<string, unknown>) => void;
  onBack: () => void;
}

export default function ExcelToPdfConfig({ inputFiles, onStart, onBack }: ExcelToPdfConfigProps) {
  const { runtime } = usePlatform();
  const [fileNames, setFileNames] = useState<string[]>([]);

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

  return (
    <div className="tool-config-root">
      <p className="tool-config-copy">
        Ready to convert <strong>{fileNames.length}</strong> Excel file{fileNames.length === 1 ? '' : 's'} to PDF.
      </p>

      <ul className="tool-config-list">
        {fileNames.map((name, index) => (
          <li key={`${name}-${index}`} className="tool-config-list-item">
            {name}
          </li>
        ))}
      </ul>

      <div className="tool-config-actions">
        <button className="btn-ghost" onClick={onBack}>
          Cancel
        </button>
        <button className="btn-primary" onClick={() => onStart({})}>
          Run Excel to PDF
        </button>
      </div>
    </div>
  );
}
