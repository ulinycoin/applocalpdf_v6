import { useMemo, useState } from 'react';
import { useStudioStore, type PageItem, type StudioDocument, type StudioState } from '../../v6/components/Studio/studio-store';
import { LinearIcon } from '../../v6/components/icons/linear-icon';
import { usePlatform } from './platform-context';
import { PipelineRunner } from '../../v6/studio/pipeline/PipelineRunner';
import type { IPipelineRecipe } from '../../v6/studio/pipeline/types';
import { openBillingPlans } from './billing';
import { getOrCreateFlowId } from '../platform/browser-context';
import { StudioDownloadModal } from './StudioDownloadModal';

const DEFAULT_MARKETING_SITE_URL = 'http://127.0.0.1:4321';

interface StudioTopNavProps {
  telemetryEnabled: boolean;
  onToggleTelemetry: () => void;
  telemetryOpen: boolean;
}

function canExportAsSourceFile(pages: PageItem[]): { fileId: string } | null {
  if (pages.length === 0) {
    return null;
  }
  const sourceFileId = pages[0].fileId;
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (page.fileId !== sourceFileId) {
      return null;
    }
    if ((page.rotation % 360) !== 0) {
      return null;
    }
    if (page.pageIndex !== index) {
      return null;
    }
  }
  return { fileId: sourceFileId };
}

export function StudioTopNav({ telemetryEnabled, onToggleTelemetry, telemetryOpen }: StudioTopNavProps) {
  const { runtime } = usePlatform();
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [downloadFileName, setDownloadFileName] = useState('');
  const [downloadTargetDocumentId, setDownloadTargetDocumentId] = useState<string | null>(null);
  const documents = useStudioStore((s: StudioState) => s.documents);
  const activeDocumentId = useStudioStore((s: StudioState) => s.activeDocumentId);
  const markWorkspaceExported = useStudioStore((s: StudioState) => s.markWorkspaceExported);

  const activeDocument = useMemo(
    () => documents.find((doc: StudioDocument) => doc.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  );
  const hasActivePages = (activeDocument?.pages.length ?? 0) > 0;
  const marketingSiteUrl = import.meta.env.DEV
    ? (import.meta.env.VITE_MARKETING_SITE_URL?.trim() || DEFAULT_MARKETING_SITE_URL)
    : '/';

  const exportDocument = async (doc: StudioDocument, fileName: string): Promise<void> => {
    const directSource = canExportAsSourceFile(doc.pages);
    if (directSource) {
      const entry = await runtime.vfs.read(directSource.fileId);
      const blob = await entry.getBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      markWorkspaceExported();
      return;
    }

    const sequence = doc.pages.map((page: PageItem) => ({
      sourceFileId: page.fileId,
      pageIndex: page.pageIndex,
      rotation: page.rotation,
    }));
    if (sequence.length === 0) {
      return;
    }

    const recipe: IPipelineRecipe = {
      inputs: Array.from(new Set(sequence.map((item) => item.sourceFileId))),
      operations: [{ type: 'reorder', sequence }],
      outputName: fileName,
    };

    const runner = new PipelineRunner(runtime.vfs);
    const result = await runner.execute(recipe);
    const pdfBuffer = new ArrayBuffer(result.buffer.byteLength);
    new Uint8Array(pdfBuffer).set(result.buffer);
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    markWorkspaceExported();
  };

  const handleDownload = (): void => {
    if (!activeDocument || activeDocument.pages.length === 0) {
      return;
    }
    setDownloadTargetDocumentId(activeDocument.id);
    setDownloadFileName(activeDocument.name);
    setIsDownloadModalOpen(true);
  };

  const handleConfirmDownload = async (filename: string): Promise<void> => {
    const targetDocument = downloadTargetDocumentId
      ? documents.find((doc: StudioDocument) => doc.id === downloadTargetDocumentId) ?? null
      : activeDocument;
    if (!targetDocument || targetDocument.pages.length === 0) {
      return;
    }

    const fileName = filename.trim() || targetDocument.name;
    const safeName = fileName.replace(/[<>:"/\\|?*]/g, '_').slice(0, 64) || 'Workspace';

    try {
      await exportDocument(targetDocument, `${safeName}.pdf`);
      runtime.telemetry.track({
        type: 'OUTPUT_DOWNLOADED',
        flowId: getOrCreateFlowId(),
        toolId: 'studio',
        outputCount: 1,
        surface: 'studio',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed';
      console.error(message);
    } finally {
      setIsDownloadModalOpen(false);
      setDownloadTargetDocumentId(null);
    }
  };

  return (
    <header className="studio-top-nav" aria-label="Studio top navigation">
      <div className="studio-top-nav-left">
        <a href={marketingSiteUrl} className="studio-logo">
          <div className="studio-logo-text">
            <div className="studio-logo-title">LocalPDF</div>
            <div className="studio-logo-subtitle">
              <span>Studio</span>
            </div>
          </div>
        </a>
        {runtime.billing.getContext().plan === 'pro' ? (
          <div className="studio-badge-pro">PRO</div>
        ) : (
          <button
            type="button"
            className="studio-upgrade-btn"
            onClick={() => {
              openBillingPlans(import.meta.env.VITE_BILLING_URL);
            }}
          >
            Upgrade
          </button>
        )}
      </div>

      <div className="studio-top-nav-center" aria-live="polite" />

      <div className="studio-top-nav-right">
        <button
          type="button"
          className="studio-tab-btn"
          onClick={handleDownload}
          disabled={!hasActivePages}
          title={!hasActivePages ? 'No pages in active workspace' : 'Download active workspace'}
        >
          <LinearIcon name="download" className="linear-icon" />
          <span>Download</span>
        </button>
      </div>
      <StudioDownloadModal
        isOpen={isDownloadModalOpen}
        fileName={downloadFileName}
        onClose={() => {
          setIsDownloadModalOpen(false);
          setDownloadTargetDocumentId(null);
        }}
        onDownload={(filename) => {
          void handleConfirmDownload(filename);
        }}
      />
    </header>
  );
}
