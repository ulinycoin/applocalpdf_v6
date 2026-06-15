import { useEffect, useMemo, useState } from 'react';
import { useStudioStore, type PageItem, type StudioDocument, type StudioState } from '../../v6/components/Studio/studio-store';
import { usePlatform } from './platform-context';
import { PipelineRunner } from '../../v6/studio/pipeline/PipelineRunner';
import type { IPipelineRecipe } from '../../v6/studio/pipeline/types';
import { openBillingPlans } from './billing';
import { getOrCreateFlowId } from '../platform/browser-context';
import { StudioDownloadModal } from './StudioDownloadModal';
import { getTrialState } from '../platform/trial-manager';
import { TrialBanner } from './trial-banner';
import QRCode from 'qrcode';
import { APP_BASE_PATH } from '../../../shared/app-routes';

function truncateFileName(name: string, maxLen = 22): string {
  if (name.length <= maxLen) return name;
  const ext = name.lastIndexOf('.');
  if (ext > 0 && name.length - ext <= 5) {
    return name.slice(0, maxLen - 3 - (name.length - ext)) + '…' + name.slice(ext);
  }
  return name.slice(0, maxLen - 1) + '…';
}

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
  const [isActivateOpen, setIsActivateOpen] = useState(false);
  const [licenseToken, setLicenseToken] = useState('');
  const [activateStatus, setActivateStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const [billingContext, setBillingContext] = useState(() => runtime.billing.getContext());

  useEffect(() => {
    return runtime.billing.subscribe((ctx) => {
      setBillingContext(ctx);
    });
  }, [runtime.billing]);

  const handleActivate = async (): Promise<void> => {
    const rawInput = licenseToken.trim();
    if (!rawInput) return;
    setActivateStatus('loading');

    // If input looks like a license key (not a JWT), call restore API first
    const isLicenseKey = rawInput.includes('-') || !rawInput.includes('.');
    let jwt: string;

    if (isLicenseKey) {
      try {
        const restoreUrl = import.meta.env.DEV
          ? 'https://localpdf.online/api/billing/restore'
          : '/api/billing/restore';
        const res = await fetch(restoreUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenseKey: rawInput }),
        });
        const data = await res.json();
        if (!data.success) {
          if (import.meta.env.DEV) {
            // В режиме разработки подставляем моковый JWT при ошибке валидации
            jwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJsb2NhbHBkZi1iaWxsaW5nIiwiYXVkIjoibG9jYWxwZGYtdjYiLCJzdWIiOiJtYW51YWwtdGVzdC1hY3RpdmF0aW9uIiwicGxhbiI6InBybyIsInRpZXIiOiJwcm9fbW9udGhseSIsImVudGl0bGVtZW50cyI6eyJtYXhXb3Jrc3BhY2VzIjoxMDAwLCJtYXhQYWdlc1BlckRvY3VtZW50IjoxMDAwLCJvY3JFbmFibGVkIjp0cnVlLCJlZGl0RW5hYmxlZCI6dHJ1ZSwiZXhwb3J0RW5hYmxlZCI6dHJ1ZX0sImlhdCI6MTc4MDc2NDYxMywibmJmIjoxNzgwNzY0NjEzLCJleHAiOjE3ODMzNTY2MTN9.0dCr02UPqyzobTFOpmJY5AXe4eUVu_VIcn7nMlDcrWEmQth2UDAreK24xTf5PzWZrIcbZ-RNTNDBe6cYW2yeCozkj4pmYnwzPNAFwLejuA0if2IUBFYfkfl8fI4NtcmM5XUYKk568WK03Xx4_bgWa_GCiCSsOdJO_2dXdwOaBTBYIt38usI32xJbUZsq_LroKMr3R8pw0QLh1rowiQe-cOyribMKV5x0LK1AC-tyaF-UOVdN2OC2aQnjY-UnIAemXrKIxXX1ypABHw295lwvK27ySkGuxK0PzPEjEsf82_w3xvqqNLV1oj_k-Do6EZB1w1VYZdZWCjy4av63VdkFvg';
          } else {
            setActivateStatus('error');
            return;
          }
        } else {
          jwt = data.token;
        }
      } catch {
        if (import.meta.env.DEV) {
          // В режиме разработки подставляем моковый JWT при сетевой ошибке
          jwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJsb2NhbHBkZi1iaWxsaW5nIiwiYXVkIjoibG9jYWxwZGYtdjYiLCJzdWIiOiJtYW51YWwtdGVzdC1hY3RpdmF0aW9uIiwicGxhbiI6InBybyIsInRpZXIiOiJwcm9fbW9udGhseSIsImVudGl0bGVtZW50cyI6eyJtYXhXb3Jrc3BhY2VzIjoxMDAwLCJtYXhQYWdlc1BlckRvY3VtZW50IjoxMDAwLCJvY3JFbmFibGVkIjp0cnVlLCJlZGl0RW5hYmxlZCI6dHJ1ZSwiZXhwb3J0RW5hYmxlZCI6dHJ1ZX0sImlhdCI6MTc4MDc2NDYxMywibmJmIjoxNzgwNzY0NjEzLCJleHAiOjE3ODMzNTY2MTN9.0dCr02UPqyzobTFOpmJY5AXe4eUVu_VIcn7nMlDcrWEmQth2UDAreK24xTf5PzWZrIcbZ-RNTNDBe6cYW2yeCozkj4pmYnwzPNAFwLejuA0if2IUBFYfkfl8fI4NtcmM5XUYKk568WK03Xx4_bgWa_GCiCSsOdJO_2dXdwOaBTBYIt38usI32xJbUZsq_LroKMr3R8pw0QLh1rowiQe-cOyribMKV5x0LK1AC-tyaF-UOVdN2OC2aQnjY-UnIAemXrKIxXX1ypABHw295lwvK27ySkGuxK0PzPEjEsf82_w3xvqqNLV1oj_k-Do6EZB1w1VYZdZWCjy4av63VdkFvg';
        } else {
          setActivateStatus('error');
          return;
        }
      }
    } else {
      jwt = rawInput;
    }

    const ok = await runtime.billing.saveToken(jwt);
    if (ok) {
      setIsActivateOpen(false);
      setLicenseToken('');
      setActivateStatus('idle');
    } else {
      setActivateStatus('error');
    }
  };
  const documents = useStudioStore((s: StudioState) => s.documents);
  const activeDocumentId = useStudioStore((s: StudioState) => s.activeDocumentId);
  const setActiveDocument = useStudioStore((s: StudioState) => s.setActiveDocument);
  const removeDocument = useStudioStore((s: StudioState) => s.removeDocument);
  const addDocument = useStudioStore((s: StudioState) => s.addDocument);
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

  const handleShareToPhone = async (
    filename: string,
    onProgress: (msg: string) => void
  ): Promise<{ qrCodeUrl: string; shareLink: string }> => {
    const targetDocument = downloadTargetDocumentId
      ? documents.find((doc: StudioDocument) => doc.id === downloadTargetDocumentId) ?? null
      : activeDocument;
    if (!targetDocument || targetDocument.pages.length === 0) {
      throw new Error('No pages in workspace to share.');
    }

    const name = filename.trim() || targetDocument.name;
    const safeName = name.replace(/[<>:"/\\|?*]/g, '_').slice(0, 64) || 'Workspace';

    // 1. Compile PDF document inside the browser using PipelineRunner
    onProgress('Compiling PDF document...');
    const sequence = targetDocument.pages.map((page: PageItem) => ({
      sourceFileId: page.fileId,
      pageIndex: page.pageIndex,
      rotation: page.rotation,
    }));
    const recipe: IPipelineRecipe = {
      inputs: Array.from(new Set(sequence.map((item) => item.sourceFileId))),
      operations: [{ type: 'reorder', sequence }],
      outputName: `${safeName}.pdf`,
    };

    const runner = new PipelineRunner(runtime.vfs);
    const result = await runner.execute(recipe);
    const pdfBuffer = new ArrayBuffer(result.buffer.byteLength);
    new Uint8Array(pdfBuffer).set(result.buffer);

    // 2. Generate E2EE AES Key and IV
    onProgress('Encrypting document locally...');
    const key = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // 3. Encrypt the compiled PDF buffer
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      pdfBuffer
    );

    // 4. Export key & iv to HEX for URL query representation
    const exportedKey = await window.crypto.subtle.exportKey('raw', key);
    const keyHex = Array.from(new Uint8Array(exportedKey))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const ivHex = Array.from(iv)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    onProgress('Uploading encrypted payload...');
    // 5. Upload to tmpfiles.org
    const encryptedBlob = new Blob([encryptedBuffer], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', encryptedBlob, 'secured_workspace.pdf');

    const response = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload server responded with code ${response.status}`);
    }

    const json = await response.json();
    if (json.status !== 'success' || !json.data?.url) {
      throw new Error('Upload failed to return a valid sharing URL');
    }

    const uploadUrl = json.data.url as string;
    const downloadUrl = uploadUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');

    // 6. Build the share link (encryption key goes in hash)
    const baseUrl = `${window.location.origin}${APP_BASE_PATH}/share`;
    const shareLink = `${baseUrl}#url=${encodeURIComponent(downloadUrl)}&key=${keyHex}&iv=${ivHex}`;

    // 7. Generate QR-code
    onProgress('Generating QR code...');
    const qrCodeUrl = await QRCode.toDataURL(shareLink, {
      width: 200,
      margin: 1,
      color: {
        dark: '#142028',
        light: '#ffffff',
      },
    });

    runtime.telemetry.track({
      type: 'OUTPUT_DOWNLOADED',
      flowId: getOrCreateFlowId(),
      toolId: 'studio-share',
      outputCount: 1,
      surface: 'studio',
    });

    return { qrCodeUrl, shareLink };
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
    <div className="studio-top-nav-container">
      <TrialBanner />
      <header className="studio-top-nav" aria-label="Studio top navigation">
      <a href={marketingSiteUrl} className="studio-logo" style={{ flexShrink: 0 }}>
        <div className="studio-nav-logo-icon">L</div>
        <span className="studio-logo-title">LocalPDF</span>
      </a>
      <span className="studio-nav-sep">/</span>

      <div className="studio-nav-tabs" role="tablist" aria-label="Open workspaces">
        {documents.map((doc) => {
          const isActive = doc.id === activeDocumentId;
          return (
            <div
              key={doc.id}
              role="tab"
              aria-selected={isActive}
              className={`studio-nav-tab${isActive ? ' active' : ''}`}
              onClick={() => { setActiveDocument(doc.id); }}
              title={doc.name}
            >
              <span className={`studio-nav-tab-dot${doc.isModified ? '' : ' saved'}`} />
              <span className="studio-nav-tab-name">{truncateFileName(doc.name)}</span>
              <span className="studio-nav-tab-close" aria-label="Close workspace" onClick={(e) => {
                e.stopPropagation();
                removeDocument(doc.id);
              }}>✕</span>
            </div>
          );
        })}
        <div
          className="studio-nav-tab-add"
          title="New workspace"
          onClick={() => {
            const id = crypto.randomUUID();
            addDocument({ id, name: `Workspace ${documents.length + 1}`, x: 100, y: 100, pages: [], allowEmpty: true, includeInExport: true, isModified: true });
          }}
        >+</div>
      </div>

      <div className="studio-nav-actions">
        <button
          type="button"
          className="studio-nav-btn"
          onClick={handleDownload}
          disabled={!hasActivePages}
          title={!hasActivePages ? 'No pages in active workspace' : 'Download active workspace'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download
        </button>
        {billingContext.plan === 'pro' && !getTrialState().isActive ? (
          <div className="studio-badge-pro">PRO</div>
        ) : getTrialState().isActive ? (
          <>
            <div className="studio-badge-trial">TRIAL</div>
            <button
              type="button"
              className="studio-activate-btn"
              onClick={() => { setIsActivateOpen(true); }}
              title="Enter license key after purchase"
            >
              Activate
            </button>
            <button
              type="button"
              className="studio-upgrade-btn"
              onClick={() => { openBillingPlans(import.meta.env.VITE_BILLING_URL); }}
            >
              Upgrade
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="studio-activate-btn"
              onClick={() => { setIsActivateOpen(true); }}
              title="Enter license key after purchase"
            >
              Activate
            </button>
            <button
              type="button"
              className="studio-upgrade-btn"
              onClick={() => { openBillingPlans(import.meta.env.VITE_BILLING_URL); }}
            >
              Upgrade
            </button>
          </>
        )}

        {isActivateOpen && (
          <div className="studio-activate-overlay" role="presentation" onClick={() => { setIsActivateOpen(false); setActivateStatus('idle'); }}>
            <div className="studio-activate-modal" role="dialog" aria-modal="true" aria-label="Activate license" onClick={(e) => e.stopPropagation()}>
              <h3 className="studio-activate-title">Activate Pro license</h3>
              <p className="studio-activate-sub">Paste the license key from your purchase email.</p>
              <input
                className="studio-activate-input"
                type="text"
                placeholder="eyJ..."
                value={licenseToken}
                onChange={(e) => { setLicenseToken(e.target.value); setActivateStatus('idle'); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleActivate(); }}
                autoFocus
                spellCheck={false}
              />
              {activateStatus === 'error' && (
                <p className="studio-activate-error">Invalid or expired license key. Check your email and try again.</p>
              )}
              <div className="studio-activate-actions">
                <button type="button" className="studio-activate-btn-ghost" onClick={() => { setIsActivateOpen(false); setActivateStatus('idle'); }}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="studio-activate-btn-primary"
                  disabled={!licenseToken.trim() || activateStatus === 'loading'}
                  onClick={() => { void handleActivate(); }}
                >
                  {activateStatus === 'loading' ? 'Verifying…' : 'Activate'}
                </button>
              </div>
            </div>
          </div>
        )}
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
        onShare={handleShareToPhone}
      />
      </header>
    </div>
  );
}
