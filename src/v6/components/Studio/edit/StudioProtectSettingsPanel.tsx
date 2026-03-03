import { useEffect, useMemo, useState } from 'react';

interface StudioProtectSettingsPanelProps {
  onOptionsChange: (options: Record<string, unknown>) => void;
  ui: {
    protectPasswordRequired: string;
  };
}

type SecurityPreset = 'basic' | 'business' | 'confidential' | 'custom';
type PrintingPermission = 'none' | 'low' | 'full';

export function StudioProtectSettingsPanel({ onOptionsChange, ui }: StudioProtectSettingsPanelProps) {
  const [permissionsOnly, setPermissionsOnly] = useState(true);
  const [userPassword, setUserPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [useOwnerPassword, setUseOwnerPassword] = useState(false);
  const [keyLength, setKeyLength] = useState<128 | 256>(256);
  const [securityPreset, setSecurityPreset] = useState<SecurityPreset>('business');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [printing, setPrinting] = useState<PrintingPermission>('full');
  const [copying, setCopying] = useState(false);
  const [modifying, setModifying] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [fillingForms, setFillingForms] = useState(true);
  const [contentAccessibility, setContentAccessibility] = useState(true);
  const [documentAssembly, setDocumentAssembly] = useState(false);

  const passwordError = useMemo(() => {
    if (!permissionsOnly && userPassword.trim().length === 0) {
      return ui.protectPasswordRequired;
    }
    return null;
  }, [permissionsOnly, ui.protectPasswordRequired, userPassword]);

  useEffect(() => {
    onOptionsChange({
      permissionsOnly,
      userPassword: userPassword.trim(),
      ownerPassword: ownerPassword.trim(),
      keyLength,
      printing,
      copying,
      modifying,
      annotating,
      fillingForms,
      contentAccessibility,
      documentAssembly,
    });
  }, [
    annotating,
    contentAccessibility,
    copying,
    documentAssembly,
    fillingForms,
    keyLength,
    modifying,
    onOptionsChange,
    ownerPassword,
    permissionsOnly,
    printing,
    userPassword,
  ]);

  const applyPreset = (preset: SecurityPreset): void => {
    setSecurityPreset(preset);
    if (preset === 'custom') {
      return;
    }
    if (preset === 'basic') {
      setPrinting('full');
      setCopying(true);
      setModifying(false);
      setAnnotating(true);
      setFillingForms(true);
      setKeyLength(128);
      return;
    }
    if (preset === 'business') {
      setPrinting('full');
      setCopying(false);
      setModifying(false);
      setAnnotating(false);
      setFillingForms(true);
      setKeyLength(256);
      return;
    }
    setPrinting('none');
    setCopying(false);
    setModifying(false);
    setAnnotating(false);
    setFillingForms(false);
    setKeyLength(256);
  };

  return (
    <div className="studio-forms-quickbar-wrap" style={{ marginBottom: 8 }}>
      <div className="tool-config-card" style={{ display: 'grid', gap: '0.75rem' }}>
        <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <button className={securityPreset === 'basic' ? 'btn-primary' : 'btn-ghost'} onClick={() => applyPreset('basic')}>Basic</button>
          <button className={securityPreset === 'business' ? 'btn-primary' : 'btn-ghost'} onClick={() => applyPreset('business')}>Business</button>
          <button className={securityPreset === 'confidential' ? 'btn-primary' : 'btn-ghost'} onClick={() => applyPreset('confidential')}>Confidential</button>
        </div>

        <label className="tool-config-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={permissionsOnly}
            onChange={(event) => {
              const next = event.target.checked;
              setPermissionsOnly(next);
              if (next) {
                setUserPassword('');
              }
            }}
          />
          Restrictions only (no password to open)
        </label>

        {!permissionsOnly && (
          <div>
            <label className="tool-config-label">User Password</label>
            <input
              className="tool-config-input"
              type="password"
              value={userPassword}
              onChange={(event) => setUserPassword(event.target.value)}
              placeholder="Required to open the PDF"
            />
            {passwordError && <p style={{ color: '#fca5a5', fontSize: 12, marginTop: 4 }}>{passwordError}</p>}
          </div>
        )}

        <label className="tool-config-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" checked={useOwnerPassword} onChange={(event) => setUseOwnerPassword(event.target.checked)} />
          Use different owner password
        </label>

        {useOwnerPassword && (
          <div>
            <label className="tool-config-label">Owner Password</label>
            <input
              className="tool-config-input"
              type="password"
              value={ownerPassword}
              onChange={(event) => setOwnerPassword(event.target.value)}
              placeholder="Used to change restrictions"
            />
          </div>
        )}

        <div>
          <label className="tool-config-label">Encryption Strength</label>
          <select
            className="tool-config-select"
            value={keyLength}
            onChange={(event) => setKeyLength(Number(event.target.value) === 128 ? 128 : 256)}
          >
            <option value={256}>AES-256</option>
            <option value={128}>AES-128</option>
          </select>
        </div>

        <button className="btn-ghost" onClick={() => setShowAdvanced((prev) => !prev)}>
          {showAdvanced ? 'Hide' : 'Show'} Advanced Restrictions
        </button>

        {showAdvanced && (
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            <div>
              <label className="tool-config-label">Printing</label>
              <select
                className="tool-config-select"
                value={printing}
                onChange={(event) => {
                  setSecurityPreset('custom');
                  const value = event.target.value;
                  setPrinting(value === 'none' || value === 'low' ? value : 'full');
                }}
              >
                <option value="none">None</option>
                <option value="low">Low Resolution</option>
                <option value="full">High Resolution</option>
              </select>
            </div>
            <label className="tool-config-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              Allow copying
              <input type="checkbox" checked={copying} onChange={(event) => { setSecurityPreset('custom'); setCopying(event.target.checked); }} />
            </label>
            <label className="tool-config-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              Allow modifying
              <input type="checkbox" checked={modifying} onChange={(event) => { setSecurityPreset('custom'); setModifying(event.target.checked); }} />
            </label>
            <label className="tool-config-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              Allow annotations
              <input type="checkbox" checked={annotating} onChange={(event) => { setSecurityPreset('custom'); setAnnotating(event.target.checked); }} />
            </label>
            <label className="tool-config-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              Allow filling forms
              <input type="checkbox" checked={fillingForms} onChange={(event) => { setSecurityPreset('custom'); setFillingForms(event.target.checked); }} />
            </label>
            <label className="tool-config-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              Allow accessibility
              <input type="checkbox" checked={contentAccessibility} onChange={(event) => { setSecurityPreset('custom'); setContentAccessibility(event.target.checked); }} />
            </label>
            <label className="tool-config-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              Allow document assembly
              <input type="checkbox" checked={documentAssembly} onChange={(event) => { setSecurityPreset('custom'); setDocumentAssembly(event.target.checked); }} />
            </label>
          </div>
        )}

        {passwordError && (
          <p style={{ color: '#fca5a5', fontSize: 12, margin: 0 }}>{passwordError}</p>
        )}
      </div>
    </div>
  );
}
