import { useEffect, useState } from 'react';

type DecryptState = 'loading' | 'decrypting' | 'ready' | 'error';

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

export function MobileShareDownloader() {
  const [status, setStatus] = useState<DecryptState>('loading');
  const [statusMessage, setStatusMessage] = useState('Initializing secure download...');
  const [decryptedBlob, setDecryptedBlob] = useState<Blob | null>(null);

  useEffect(() => {
    const startSecureDownload = async () => {
      try {
        // 1. Parse hash arguments
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const encryptedUrl = params.get('url');
        const keyHex = params.get('key');
        const ivHex = params.get('iv');

        if (!encryptedUrl || !keyHex || !ivHex) {
          throw new Error('Invalid or missing security parameters in link.');
        }

        setStatusMessage('Connecting to secure cloud...');
        
        // 2. Fetch encrypted binary payload
        const response = await fetch(encryptedUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch file. Server returned code ${response.status}.`);
        }

        setStatusMessage('Downloading encrypted payload...');
        const encryptedBuffer = await response.arrayBuffer();

        setStatus('decrypting');
        setStatusMessage('Decrypting file locally in browser...');

        // 3. Re-import the raw AES key
        const keyBuffer = hexToBuffer(keyHex);
        const ivBuffer = hexToBuffer(ivHex);

        const cryptoKey = await window.crypto.subtle.importKey(
          'raw',
          keyBuffer,
          { name: 'AES-GCM' },
          true,
          ['decrypt']
        );

        // 4. Decrypt the binary buffer
        const decryptedBuffer = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
          cryptoKey,
          encryptedBuffer
        );

        const blob = new Blob([decryptedBuffer], { type: 'application/pdf' });
        setDecryptedBlob(blob);
        setStatus('ready');
        setStatusMessage('Decrypted successfully!');
      } catch (err: any) {
        console.error('E2EE Decryption Failed:', err);
        setStatus('error');
        setStatusMessage(err?.message || 'Secure decryption failed. The file might have expired.');
      }
    };

    void startSecureDownload();
  }, []);

  const handleDownload = () => {
    if (!decryptedBlob) return;
    const objectUrl = URL.createObjectURL(decryptedBlob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = 'shared_document.pdf';
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100%',
      background: 'radial-gradient(circle at top, #1c2d38 0%, #0d161a 100%)',
      color: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      padding: '24px 16px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: 'rgba(255, 255, 255, 0.04)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '24px',
        padding: '32px 24px',
        boxSizing: 'border-box',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        {/* Header Icon */}
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #2383e2 0%, #175492 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px',
          boxShadow: '0 8px 16px rgba(35, 131, 226, 0.3)'
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>

        <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>LocalPDF Share</h2>
        <p style={{ fontSize: '13px', color: '#8d9fa9', margin: '0 0 32px 0', lineHeight: 1.5 }}>
          Your file is decrypted locally. The cloud server never gets the key to read your content.
        </p>

        {/* Content Box */}
        <div style={{
          width: '100%',
          minHeight: '140px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          marginBottom: '8px'
        }}>
          {(status === 'loading' || status === 'decrypting') && (
            <>
              <div style={{
                width: '40px',
                height: '40px',
                border: '3px solid rgba(255, 255, 255, 0.1)',
                borderTopColor: '#2383e2',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#eef2f5' }}>{statusMessage}</div>
            </>
          )}

          {status === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'rgba(224, 62, 62, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e03e3e" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#ff8787', padding: '0 12px' }}>{statusMessage}</div>
            </div>
          )}

          {status === 'ready' && decryptedBlob && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(43, 138, 62, 0.15)', padding: '12px 20px', borderRadius: '50px', border: '1px solid rgba(43, 138, 62, 0.3)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#51cf66" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#51cf66' }}>Ready to Download</span>
              </div>

              <button
                onClick={handleDownload}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #2b8a3e 0%, #217030 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '14px 20px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 8px 20px rgba(43, 138, 62, 0.25)',
                  transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'scale(0.98)';
                  e.currentTarget.style.boxShadow = '0 4px 10px rgba(43, 138, 62, 0.2)';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(43, 138, 62, 0.25)';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Save PDF to Device
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
