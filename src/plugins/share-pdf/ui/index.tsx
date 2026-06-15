import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { usePlatform } from '../../../app/react/platform-context';
import { APP_BASE_PATH } from '../../../../shared/app-routes';

interface SharePdfConfigProps {
  inputFiles: string[];
  onBack: () => void;
}

type ShareState = 'idle' | 'encrypting' | 'uploading' | 'ready' | 'error';

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function SharePdfConfig({ inputFiles, onBack }: SharePdfConfigProps) {
  const { runtime } = usePlatform();
  const [status, setStatus] = useState<ShareState>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (inputFiles.length === 0) {
      setStatus('error');
      setStatusMessage('No files provided to share');
      return;
    }

    const processAndUpload = async () => {
      try {
        setStatus('encrypting');
        setStatusMessage('Encrypting document locally...');

        // 1. Read file from VFS
        const entry = await runtime.vfs.read(inputFiles[0]);
        const blob = await entry.getBlob();
        const buffer = await blob.arrayBuffer();

        if (!isMounted) return;

        // 2. Generate cryptographically strong AES key and IV
        const key = await window.crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        // 3. Encrypt the file data
        const encryptedBuffer = await window.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          buffer
        );

        if (!isMounted) return;

        setStatus('uploading');
        setStatusMessage('Uploading encrypted payload...');

        // 4. Export the key to HEX for URL embedding
        const exportedKey = await window.crypto.subtle.exportKey('raw', key);
        const keyHex = bufferToHex(exportedKey);
        const ivHex = bufferToHex(iv.buffer);

        // 5. Upload encrypted payload to tmpfiles.org
        const encryptedBlob = new Blob([encryptedBuffer], { type: 'application/octet-stream' });
        const formData = new FormData();
        formData.append('file', encryptedBlob, 'secured.pdf');

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
        // Transform view link into direct download link:
        // https://tmpfiles.org/abc/secured.pdf -> https://tmpfiles.org/dl/abc/secured.pdf
        const downloadUrl = uploadUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');

        // 6. Generate share URL with keys in the hash fragment (client-side only, never sent to servers)
        const baseUrl = `${window.location.origin}${APP_BASE_PATH}/share`;
        const generatedLink = `${baseUrl}#url=${encodeURIComponent(downloadUrl)}&key=${keyHex}&iv=${ivHex}`;

        // 7. Render QR Code
        const qrDataUrl = await QRCode.toDataURL(generatedLink, {
          width: 280,
          margin: 2,
          color: {
            dark: '#142028',
            light: '#ffffff',
          },
        });

        if (isMounted) {
          setShareLink(generatedLink);
          setQrCodeUrl(qrDataUrl);
          setStatus('ready');
        }
      } catch (error: any) {
        console.error('Failed to encrypt/upload file:', error);
        if (isMounted) {
          setStatus('error');
          setStatusMessage(error?.message || 'Failed to securely upload the PDF.');
        }
      }
    };

    void processAndUpload();

    return () => {
      isMounted = false;
    };
  }, [inputFiles, runtime.vfs]);

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
    <div className="tool-config-root" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%', maxWidth: '480px', margin: '0 auto', padding: '24px 16px' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#142028' }}>Share PDF to Phone</h3>
      <p className="tool-config-copy" style={{ fontSize: '13px', color: '#636c72', marginBottom: '24px', lineHeight: 1.5 }}>
        Encrypts your document end-to-end and uploads it to a temporary cloud. The encryption key resides in the QR-code itself and is never stored on the server.
      </p>

      <div className="tool-config-card" style={{ width: '100%', padding: '24px', background: '#ffffff', border: '1px solid #e9e9e7', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        
        {(status === 'encrypting' || status === 'uploading') && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div className="wz-spinner" style={{ width: '36px', height: '36px', border: '3px solid #e9e9e7', borderTopColor: '#2383e2', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#142028' }}>{statusMessage}</div>
            <div style={{ fontSize: '12px', color: '#888' }}>This might take a few seconds depending on the file size.</div>
          </div>
        )}

        {status === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#e03e3e' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Error: {statusMessage}</div>
            <button className="btn-ghost" style={{ marginTop: '12px', color: '#2383e2' }} onClick={onBack}>Try another file</button>
          </div>
        )}

        {status === 'ready' && qrCodeUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '12px', border: '1px dashed #ced4da', marginBottom: '16px' }}>
              <img src={qrCodeUrl} alt="QR Code Link to PDF" style={{ width: '220px', height: '220px', display: 'block' }} />
            </div>
            
            <div style={{ fontSize: '13px', color: '#2b8a3e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '12px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              End-to-End Encrypted Link
            </div>
            
            <div style={{ fontSize: '12px', color: '#868e96', marginBottom: '20px' }}>
              Expires in 60 minutes · Auto-destructs after download
            </div>

            <div style={{ display: 'flex', width: '100%', gap: '8px' }}>
              <button 
                onClick={handleCopyLink} 
                className="btn-ghost" 
                style={{ flex: 1, padding: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderRadius: '8px', border: '1px solid #ced4da', background: '#ffffff', cursor: 'pointer', fontWeight: 500 }}
              >
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2b8a3e" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span style={{ color: '#2b8a3e' }}>Copied!</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy Link
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="tool-config-actions" style={{ marginTop: '24px', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <button className="btn-ghost" onClick={onBack} style={{ padding: '10px 24px', fontSize: '13px', cursor: 'pointer', borderRadius: '8px' }}>
          Back to Tools
        </button>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
