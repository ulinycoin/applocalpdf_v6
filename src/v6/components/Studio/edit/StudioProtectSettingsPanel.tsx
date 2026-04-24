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
  const [userPassword, setUserPassword]       = useState('');
  const [ownerPassword, setOwnerPassword]     = useState('');
  const [useOwnerPassword, setUseOwnerPassword] = useState(false);
  const [keyLength, setKeyLength]             = useState<128 | 256>(256);
  const [securityPreset, setSecurityPreset]   = useState<SecurityPreset>('business');
  const [showAdvanced, setShowAdvanced]       = useState(false);
  const [printing, setPrinting]               = useState<PrintingPermission>('full');
  const [copying, setCopying]                 = useState(false);
  const [modifying, setModifying]             = useState(false);
  const [annotating, setAnnotating]           = useState(false);
  const [fillingForms, setFillingForms]       = useState(true);
  const [contentAccessibility, setContentAccessibility] = useState(true);
  const [documentAssembly, setDocumentAssembly] = useState(false);

  const passwordError = useMemo(() => {
    if (!permissionsOnly && userPassword.trim().length === 0) return ui.protectPasswordRequired;
    return null;
  }, [permissionsOnly, ui.protectPasswordRequired, userPassword]);

  useEffect(() => {
    onOptionsChange({
      permissionsOnly,
      userPassword: permissionsOnly ? '' : userPassword.trim(),
      ownerPassword: useOwnerPassword ? ownerPassword.trim() : '',
      keyLength,
      printing,
      copying,
      modifying,
      annotating,
      fillingForms,
      contentAccessibility,
      documentAssembly,
    });
  }, [annotating, contentAccessibility, copying, documentAssembly, fillingForms, keyLength,
      modifying, onOptionsChange, ownerPassword, permissionsOnly, printing, useOwnerPassword, userPassword]);

  const applyPreset = (preset: SecurityPreset): void => {
    setSecurityPreset(preset);
    if (preset === 'basic') {
      setPrinting('full'); setCopying(true); setModifying(false); setAnnotating(true);
      setFillingForms(true); setContentAccessibility(true); setDocumentAssembly(false); setKeyLength(128);
    } else if (preset === 'business') {
      setPrinting('full'); setCopying(false); setModifying(false); setAnnotating(false);
      setFillingForms(true); setContentAccessibility(true); setDocumentAssembly(false); setKeyLength(256);
    } else if (preset === 'confidential') {
      setPrinting('none'); setCopying(false); setModifying(false); setAnnotating(false);
      setFillingForms(false); setContentAccessibility(true); setDocumentAssembly(false); setKeyLength(256);
    }
  };

  const markCustom = () => setSecurityPreset('custom');

  return (
    <div className="ep">
      <div className="ep-section-title">Protect</div>

      {/* Preset */}
      <div className="ep-field">
        <span className="ep-field-label">Preset</span>
        <div className="ep-seg ep-seg--wrap">
          {(['basic', 'business', 'confidential'] as SecurityPreset[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`ep-seg-btn${securityPreset === p ? ' ep-seg-btn--on' : ''}`}
              onClick={() => applyPreset(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Encryption */}
      <div className="ep-field">
        <span className="ep-field-label">Encryption</span>
        <select
          className="ep-select"
          value={keyLength}
          onChange={(e) => { markCustom(); setKeyLength(Number(e.target.value) === 128 ? 128 : 256); }}
        >
          <option value={256}>AES-256</option>
          <option value={128}>AES-128</option>
        </select>
      </div>

      {/* Printing */}
      <div className="ep-field">
        <span className="ep-field-label">Printing</span>
        <select
          className="ep-select"
          value={printing}
          onChange={(e) => { markCustom(); const v = e.target.value; setPrinting(v === 'none' || v === 'low' ? v : 'full'); }}
        >
          <option value="full">High resolution</option>
          <option value="low">Low resolution</option>
          <option value="none">No printing</option>
        </select>
      </div>

      {/* Mode toggles */}
      <div className="ep-section-title" style={{ marginTop: 4 }}>Access</div>
      <div className="ep-toggles">
        <label className="ep-toggle-row">
          <input type="checkbox" checked={permissionsOnly}
            onChange={(e) => { setPermissionsOnly(e.target.checked); if (e.target.checked) setUserPassword(''); }} />
          <span>Restrictions only (no password to open)</span>
        </label>
        <label className="ep-toggle-row">
          <input type="checkbox" checked={useOwnerPassword} onChange={(e) => setUseOwnerPassword(e.target.checked)} />
          <span>Separate owner password</span>
        </label>
      </div>

      {/* Passwords */}
      {!permissionsOnly && (
        <div className="ep-field">
          <span className="ep-field-label">Open password</span>
          <input
            type="password"
            value={userPassword}
            onChange={(e) => setUserPassword(e.target.value)}
            placeholder="Required to open"
            className="ep-input"
          />
          {passwordError && <span style={{ fontSize: 11, color: 'var(--red)' }}>{passwordError}</span>}
        </div>
      )}
      {useOwnerPassword && (
        <div className="ep-field">
          <span className="ep-field-label">Owner password</span>
          <input
            type="password"
            value={ownerPassword}
            onChange={(e) => setOwnerPassword(e.target.value)}
            placeholder="Required to change restrictions"
            className="ep-input"
          />
        </div>
      )}

      {/* Advanced */}
      <button
        type="button"
        className="ep-action-btn"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? 'Hide advanced' : 'Advanced permissions'}
      </button>

      {showAdvanced && (
        <>
          <div className="ep-section-title">Permissions</div>
          <div className="ep-toggles">
            {[
              { label: 'Copy text', checked: copying,            onChange: setCopying },
              { label: 'Modify',    checked: modifying,          onChange: setModifying },
              { label: 'Annotate',  checked: annotating,         onChange: setAnnotating },
              { label: 'Fill forms',checked: fillingForms,       onChange: setFillingForms },
              { label: 'Accessibility', checked: contentAccessibility, onChange: setContentAccessibility },
              { label: 'Assembly',  checked: documentAssembly,   onChange: setDocumentAssembly },
            ].map(({ label, checked, onChange }) => (
              <label key={label} className="ep-toggle-row">
                <input type="checkbox" checked={checked}
                  onChange={(e) => { markCustom(); onChange(e.target.checked); }} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
