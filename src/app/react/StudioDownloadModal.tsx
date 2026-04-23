import { useEffect, useRef, type FormEvent } from 'react';

interface StudioDownloadModalProps {
  isOpen: boolean;
  fileName: string;
  onClose: () => void;
  onDownload: (filename: string) => void;
}

export function StudioDownloadModal({ isOpen, fileName, onClose, onDownload }: StudioDownloadModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

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
        aria-label="Download file"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <form className="studio-download-modal-form" onSubmit={handleSubmit}>
          <label className="studio-download-modal-label" htmlFor="studio-download-file-name">
            File name
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
          <div className="studio-download-modal-actions">
            <button type="button" className="studio-download-modal-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="studio-download-modal-primary">
              Download
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
