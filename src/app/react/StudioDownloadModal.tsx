import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { StudioDocumentRedactVerify } from '../../v6/components/Studio/store/studio-store-types';

interface StudioDownloadModalProps {
  isOpen: boolean;
  fileName: string;
  onClose: () => void;
  onDownload: (filename: string) => void;
  onShare: (filename: string, onProgress: (msg: string) => void) => Promise<{ qrCodeUrl: string; shareLink: string }>;
  redactVerify?: StudioDocumentRedactVerify | null;
  canDownloadCertificate?: boolean;
  onDownloadCertificate?: () => void;
  onCertificatePaywall?: () => void;
}

type ModalMode = 'input' | 'processing' | 'ready' | 'error';

function checkTone(result: string): string {
  if (result === 'pass') return '#2b8a3e';
  if (result === 'skip') return 'var(--text-muted)';
  return 'var(--red, #c92a2a)';
}

export function StudioDownloadModal({
  isOpen,
  fileName,
  onClose,
  onDownload,
  onShare,
  redactVerify = null,
  canDownloadCertificate = false,
  onDownloadCertificate,
  onCertificatePaywall,
}: StudioDownloadModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<ModalMode>('input');
  const [statusMessage, setStatusMessage] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const passedCount = redactVerify?.checks.filter((check) => check.result === 'pass').length ?? 0;
  const totalChecks = redactVerify?.checks.length ?? 0;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setMode('input');
    setQrCodeUrl(null);
    setShareLink('');
    setErrorMessage('');
    setCopied(false);

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [isOpen, fileName]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const nextFileName = inputRef.current?.value ?? fileName;
    onDownload(nextFileName);
    onClose();
  };

  const handleShareToPhone = async () => {
    const nextFileName = inputRef.current?.value ?? fileName;
    setMode('processing');
    try {
      const res = await onShare(nextFileName, (msg) => {
        setStatusMessage(msg);
      });
      setQrCodeUrl(res.qrCodeUrl);
      setShareLink(res.shareLink);
      setMode('ready');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err?.message || 'Failed to securely share document.');
      setMode('error');
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  return (
    <div
      className="studio-download-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="studio-download-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Export document"
        onClick={(event) => {
          event.stopPropagation();
        }}
        style={{ minWidth: '350px' }}
      >
        {mode === 'input' && (
          <form className="studio-download-modal-form" onSubmit={handleSubmit}>
            <label className="studio-download-modal-label" htmlFor="studio-download-file-name">
              Export Document
            </label>
            <input
              ref={inputRef}
              id="studio-download-file-name"
              className="studio-download-modal-input"
              type="text"
              defaultValue={fileName}
              autoComplete="off"
              spellCheck={false}
            />

            {redactVerify && (
              <div className="studio-redact-verify-panel" data-testid="studio-redact-verify-panel">
                <div className="studio-redact-verify-title">
                  {redactVerify.passed
                    ? `Redaction verified · ${passedCount}/${totalChecks || 4} checks`
                    : `Redaction not fully verified · ${passedCount}/${totalChecks || 4} checks`}
                </div>
                {!redactVerify.passed && (
                  <p className="studio-redact-verify-hint">
                    Text may still be extractable under the whiteout. You can download the PDF; a verification certificate is only available when all checks pass.
                  </p>
                )}
                <ul className="studio-redact-verify-list">
                  {redactVerify.checks.map((check) => (
                    <li key={check.id} style={{ color: checkTone(check.result) }}>
                      <span>{check.label}</span>
                      <span>{check.result}</span>
                    </li>
                  ))}
                </ul>
                {redactVerify.passed && redactVerify.certificateJson && (
                  <div className="studio-redact-verify-cert-row">
                    {canDownloadCertificate ? (
                      <button
                        type="button"
                        className="studio-download-modal-ghost"
                        onClick={onDownloadCertificate}
                        data-testid="studio-redact-cert-download"
                      >
                        Download certificate.json
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="studio-download-modal-ghost"
                        onClick={onCertificatePaywall}
                        data-testid="studio-redact-cert-paywall"
                        style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                      >
                        Certificate — Upgrade to Pro
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="studio-download-modal-actions" style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button type="button" className="studio-download-modal-ghost" onClick={onClose}>
                Cancel
              </button>

              <button
                type="button"
                className="studio-download-modal-ghost"
                onClick={() => { void handleShareToPhone(); }}
                style={{
                  marginRight: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderColor: '#ced4da',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                  <line x1="12" y1="18" x2="12.01" y2="18"/>
                </svg>
                Share to Phone
              </button>

              <button
                type="submit"
                className="studio-download-modal-primary"
                data-testid="studio-download-submit"
              >
                Download
              </button>
            </div>
          </form>
        )}

        {mode === 'processing' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '10px 0' }}>
            <div className="wz-spinner" style={{ width: '32px', height: '32px', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{statusMessage}</div>
          </div>
        )}

        {mode === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: 'var(--red)', padding: '10px 0' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>{errorMessage}</div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', width: '100%', justifyContent: 'center' }}>
              <button type="button" className="studio-download-modal-ghost" onClick={() => setMode('input')}>
                Back
              </button>
              <button type="button" className="studio-download-modal-ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}

        {mode === 'ready' && qrCodeUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', padding: '5px 0' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: 'var(--text)' }}>Scan to Download</div>

            <div style={{ background: '#ffffff', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '12px' }}>
              <img src={qrCodeUrl} alt="QR Code" style={{ width: '180px', height: '180px', display: 'block' }} />
            </div>

            <div style={{ fontSize: '12px', color: '#2b8a3e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              E2EE Secure Link
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Expires in 60 minutes · Auto-destructs after download
            </div>

            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <button
                type="button"
                onClick={() => { void handleCopyLink(); }}
                className="studio-download-modal-ghost"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '12px',
                }}
              >
                {copied ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2b8a3e" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span style={{ color: '#2b8a3e' }}>Copied!</span>
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy Link
                  </>
                )}
              </button>

              <button type="button" className="studio-download-modal-primary" onClick={onClose} style={{ flex: 1, fontSize: '12px' }}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
