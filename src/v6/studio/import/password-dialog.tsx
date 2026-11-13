import { useRef, type FormEvent } from 'react';

interface PasswordDialogProps {
  fileName: string;
  error?: string;
  busy: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

/**
 * The prompt a locked document gets instead of "No password given". It stays open across a wrong
 * attempt so the user can retype; the dialog only closes when the file opens or is given up on.
 */
function PasswordDialog({ fileName, error, busy, onSubmit, onCancel }: PasswordDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(inputRef.current?.value ?? '');
  };

  return (
    <div className="studio-download-modal-backdrop" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        className="studio-download-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="This PDF is password-protected"
        onClick={(event) => event.stopPropagation()}
      >
        <form className="studio-download-modal-form" onSubmit={handleSubmit}>
          <label className="studio-download-modal-label" htmlFor="studio-password-input">
            This PDF is password-protected. Enter its password to open a copy here.
          </label>
          <p className="studio-password-file">{fileName}</p>
          <input
            id="studio-password-input"
            ref={inputRef}
            className="studio-download-modal-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            disabled={busy}
          />
          {error ? <p className="studio-download-modal-error" role="alert">{error}</p> : null}
          <div className="studio-download-modal-actions">
            <button type="button" className="studio-download-modal-ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="studio-download-modal-primary" disabled={busy}>
              {busy ? 'Opening…' : 'Open PDF'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
export { PasswordDialog };
