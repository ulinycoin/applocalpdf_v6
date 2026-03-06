import { LinearIcon } from '../../icons/linear-icon';
import type { StudioConvertToolId } from './use-studio-convert-controller';

interface StudioConvertToolbarProps {
  activeTool: StudioConvertToolId | null;
  onSelectTool: (tool: StudioConvertToolId) => void;
}

export function StudioConvertToolbar({ activeTool, onSelectTool }: StudioConvertToolbarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 6px', pointerEvents: 'auto' }}>
      <button
        type="button"
        className={`studio-edit-tool-btn ${activeTool === 'ocr-pdf' ? 'active' : ''}`}
        title="OCR"
        onClick={() => onSelectTool('ocr-pdf')}
      >
        <LinearIcon name="ocr" size={22} />
      </button>
      <button
        type="button"
        className={`studio-edit-tool-btn ${activeTool === 'pdf-to-jpg' ? 'active' : ''}`}
        title="PDF to JPG"
        onClick={() => onSelectTool('pdf-to-jpg')}
      >
        <LinearIcon name="image" size={22} />
      </button>
      <button
        type="button"
        className={`studio-edit-tool-btn ${activeTool === 'extract-images' ? 'active' : ''}`}
        title="Extract Images"
        onClick={() => onSelectTool('extract-images')}
      >
        <LinearIcon name="image" size={22} />
      </button>
    </div>
  );
}
