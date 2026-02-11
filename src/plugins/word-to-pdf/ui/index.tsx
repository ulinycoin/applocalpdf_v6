import { useState, useEffect } from 'react';
import { usePlatform } from '../../../app/react/platform-context';

interface WordToPdfConfigProps {
  inputFiles: string[];
  onStart: (options: Record<string, unknown>) => void;
  onBack: () => void;
}

export default function WordToPdfConfig({ inputFiles, onStart, onBack }: WordToPdfConfigProps) {
  const { runtime } = usePlatform();
  const [fileNames, setFileNames] = useState<string[]>([]);

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

  return (
    <div className="tool-config-root">
      <p className="tool-config-copy">
        Ready to convert <strong>{fileNames.length} Word document(s)</strong> to PDF format.
      </p>

      <ul className="tool-config-list">
        {fileNames.map((name, i) => (
          <li key={`${name}-${i}`} className="tool-config-list-item">
            <span>{name}</span>
          </li>
        ))}
      </ul>

      <div className="tool-config-actions">
        <button className="btn-ghost" onClick={onBack}>
          Cancel
        </button>
        <button className="btn-primary" onClick={() => onStart({})}>
          Run Word to PDF
        </button>
      </div>
    </div>
  );
}
