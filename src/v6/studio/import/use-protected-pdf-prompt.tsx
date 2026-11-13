import { useCallback, useRef, useState } from 'react';
import { PasswordDialog } from './password-dialog';

/**
 * `ask(file)` resolves with the decrypted document, or `null` when the user gives up. The component
 * to render is returned separately so the canvas can mount it wherever it mounts its modals.
 */
export function useProtectedPdfPrompt(
  decrypt: (file: File, password: string) => Promise<Blob>,
) {
  const [request, setRequest] = useState<{ file: File } | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const resolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  const settle = useCallback((blob: Blob | null) => {
    resolveRef.current?.(blob);
    resolveRef.current = null;
    setRequest(null);
    setError(undefined);
    setBusy(false);
  }, []);

  const ask = useCallback((file: File) => new Promise<Blob | null>((resolve) => {
    resolveRef.current = resolve;
    setError(undefined);
    setBusy(false);
    setRequest({ file });
  }), []);

  const submit = useCallback(async (password: string) => {
    if (!request) {
      return;
    }
    if (!password.trim()) {
      setError('Enter the password.');
      return;
    }
    setBusy(true);
    try {
      settle(await decrypt(request.file, password));
    } catch (failure) {
      setBusy(false);
      const message = failure instanceof Error ? failure.message : String(failure);
      setError(/password/i.test(message)
        ? 'Wrong password. Try again.'
        : 'This PDF could not be opened with that password.');
    }
  }, [decrypt, request, settle]);

  const element = request
    ? (
      <PasswordDialog
        fileName={request.file.name}
        error={error}
        busy={busy}
        onSubmit={(password) => { void submit(password); }}
        onCancel={() => settle(null)}
      />
    )
    : null;

  return { ask, element };
}
