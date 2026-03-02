import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudioStore, type PageItem, type StudioDocument, type StudioState } from '../../v6/components/Studio/studio-store';
import { LinearIcon } from '../../v6/components/icons/linear-icon';
import { usePlatform } from './platform-context';
import { PipelineRunner } from '../../v6/studio/pipeline/PipelineRunner';
import type { IPipelineRecipe } from '../../v6/studio/pipeline/types';

interface StudioTopNavProps {
  onToggleTelemetry: () => void;
  telemetryOpen: boolean;
}

export function StudioTopNav({ onToggleTelemetry, telemetryOpen }: StudioTopNavProps) {
  const { runtime } = usePlatform();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);
  const documents = useStudioStore((s: StudioState) => s.documents);
  const selection = useStudioStore((s: StudioState) => s.selection);
  const activeDocumentId = useStudioStore((s: StudioState) => s.activeDocumentId);
  const interactionMode = useStudioStore((s: StudioState) => s.interactionMode);
  const setInteractionMode = useStudioStore((s: StudioState) => s.setInteractionMode);
  const addDocument = useStudioStore((s: StudioState) => s.addDocument);
  const removeDocument = useStudioStore((s: StudioState) => s.removeDocument);
  const setActiveDocument = useStudioStore((s: StudioState) => s.setActiveDocument);
  const setSelection = useStudioStore((s: StudioState) => s.setSelection);
  const requestInlineTool = useStudioStore((s: StudioState) => s.requestInlineTool);
  const markWorkspaceExported = useStudioStore((s: StudioState) => s.markWorkspaceExported);
  const startEditSession = useStudioStore((s: StudioState) => s.startEditSession);

  const activeDocument = useMemo(
    () => documents.find((doc: StudioDocument) => doc.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  );
  const selectedPages = useMemo(() => {
    return selection
      .map((selected) => {
        const doc = documents.find((candidate: StudioDocument) => candidate.id === selected.docId);
        const page = doc?.pages.find((candidatePage: PageItem) => candidatePage.id === selected.pageId);
        if (!doc || !page) {
          return null;
        }
        return {
          docId: doc.id,
          pageId: page.id,
          fileId: page.fileId,
          pageIndex: page.pageIndex,
        };
      })
      .filter((item) => item !== null);
  }, [documents, selection]);
  const hasActivePages = (activeDocument?.pages.length ?? 0) > 0;
  const hasTargetSelection = selectedPages.length > 0;
  const hasEditTarget = hasTargetSelection || hasActivePages;

  useEffect(() => {
    if (!hasEditTarget && interactionMode !== null) {
      setInteractionMode(null);
    }
  }, [hasEditTarget, interactionMode, setInteractionMode]);

  const exportDocument = async (doc: StudioDocument): Promise<void> => {
    const canDownloadSourceDirectly = (() => {
      if (doc.pages.length === 0) {
        return false;
      }
      const sourceFileId = doc.pages[0]?.fileId;
      if (!sourceFileId) {
        return false;
      }
      return doc.pages.every((page, index) => (
        page.fileId === sourceFileId
        && page.pageIndex === index
        && (page.rotation ?? 0) === 0
      ));
    })();

    if (canDownloadSourceDirectly) {
      const sourceFileId = doc.pages[0]?.fileId;
      if (sourceFileId) {
        const sourceEntry = await runtime.vfs.read(sourceFileId);
        const sourceBlob = await sourceEntry.getBlob();
        const sourceUrl = URL.createObjectURL(sourceBlob);
        const sourceAnchor = document.createElement('a');
        sourceAnchor.href = sourceUrl;
        sourceAnchor.download = sourceEntry.getName();
        sourceAnchor.click();
        URL.revokeObjectURL(sourceUrl);
        markWorkspaceExported();
        return;
      }
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
      outputName: `LocalPDF_${doc.name.replace(/[^\w.-]+/g, '_').slice(0, 64) || 'workspace'}.pdf`,
    };

    const runner = new PipelineRunner(runtime.vfs);
    const result = await runner.execute(recipe);
    const pdfBuffer = new ArrayBuffer(result.buffer.byteLength);
    new Uint8Array(pdfBuffer).set(result.buffer);
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    markWorkspaceExported();
  };

  const handleCreateSpace = (): void => {
    const maxY = documents.reduce((acc, doc) => Math.max(acc, doc.y + 360), 80);
    const nextDocId = crypto.randomUUID();
    addDocument({
      id: nextDocId,
      name: `Workspace ${documents.length + 1}`,
      x: 100,
      y: documents.length > 0 ? maxY : 100,
      pages: [],
      allowEmpty: true,
      includeInExport: true,
      isModified: true,
    });
    setActiveDocument(nextDocId);
  };

  const handleDeleteSpace = (): void => {
    if (!activeDocument) {
      return;
    }
    const confirmed = window.confirm(`Delete workspace "${activeDocument.name}"?`);
    if (!confirmed) {
      return;
    }
    removeDocument(activeDocument.id);
    setSelection([]);
    requestInlineTool(null);
  };

  const handleDownload = async (): Promise<void> => {
    if (!activeDocument || activeDocument.pages.length === 0) {
      return;
    }
    try {
      await exportDocument(activeDocument);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed';
      setNotice(message);
    }
  };

  return (
    <header className="studio-top-nav" aria-label="Studio top navigation">
      <div className="studio-top-nav-left">
        <div className="studio-segmented" role="tablist" aria-label="Mode">
          <button
            type="button"
            className={`studio-segment-btn ${hasEditTarget && interactionMode === 'edit' ? 'active' : ''}`}
            onClick={() => {
              if (!hasEditTarget) {
                return;
              }
              let targetDocId: string | null = null;
              let targetPage: PageItem | null = null;
              if (hasTargetSelection) {
                const selected = selectedPages[0];
                const doc = selected ? documents.find((candidate) => candidate.id === selected.docId) : null;
                const page = selected ? doc?.pages.find((candidate) => candidate.id === selected.pageId) : null;
                if (doc && page) {
                  targetDocId = doc.id;
                  targetPage = page;
                }
              }
              if (!targetPage && activeDocument?.pages[0]) {
                targetDocId = activeDocument.id;
                targetPage = activeDocument.pages[0];
                setSelection([{ docId: activeDocument.id, pageId: activeDocument.pages[0].id }]);
              }
              if (targetDocId && targetPage) {
                const sessionPayload = {
                  docId: targetDocId,
                  pageId: targetPage.id,
                  pageIndex: targetPage.pageIndex,
                  fileId: targetPage.fileId,
                  initialTool: 'text' as const,
                };

                const params = new URLSearchParams(window.location.search);
                const useInplace = params.get('inplace_edit') === '1';

                if (useInplace) {
                  startEditSession(sessionPayload);
                  useStudioStore.getState().setActiveEditPageId(targetPage.id);
                  setSelection([]);
                } else {
                  startEditSession(sessionPayload);
                  setInteractionMode('edit');
                  navigate('/studio/edit');
                }
              } else {
                setInteractionMode('edit');
              }
            }}
            disabled={!hasEditTarget}
            title={!hasEditTarget ? 'Select a document or page first' : 'Edit mode'}
          >
            Edit
          </button>
          <button
            type="button"
            className={`studio-segment-btn ${hasEditTarget && interactionMode === 'convert' ? 'active' : ''}`}
            onClick={() => {
              if (!hasEditTarget) {
                return;
              }
              setInteractionMode('convert');
              navigate('/studio/convert');
            }}
            disabled={!hasEditTarget}
            title={!hasEditTarget ? 'Select a document first' : 'Convert mode'}
          >
            Convert
          </button>
        </div>
      </div>

      <div className="studio-top-nav-center" aria-live="polite">
        {notice && <span className="studio-notice-pill">{notice}</span>}
      </div>

      <div className="studio-top-nav-right">
        <button
          type="button"
          className="studio-tab-btn"
          onClick={handleCreateSpace}
          title="Create workspace"
        >
          <span>New Space</span>
        </button>
        <button
          type="button"
          className="studio-tab-btn"
          onClick={handleDeleteSpace}
          disabled={!activeDocument}
          title={!activeDocument ? 'No active workspace' : 'Delete active workspace'}
        >
          <span>Delete Space</span>
        </button>
        <button
          type="button"
          className="studio-tab-btn"
          onClick={() => { void handleDownload(); }}
          disabled={!hasActivePages}
          title={!hasActivePages ? 'No pages in active workspace' : 'Download active workspace'}
        >
          <LinearIcon name="download" className="linear-icon" />
          <span>Download</span>
        </button>
        <button
          type="button"
          className="studio-tab-btn"
          onClick={onToggleTelemetry}
          aria-expanded={telemetryOpen}
        >
          <LinearIcon name={telemetryOpen ? 'chevron-up' : 'chevron-down'} className="linear-icon" />
          <span>Telemetry</span>
        </button>
      </div>
    </header >
  );
}
