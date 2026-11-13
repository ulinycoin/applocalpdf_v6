/**
 * Human answers for two import failures that used to surface as raw library text:
 * a locked PDF (`PasswordException: No password given`) and a file that cannot fit the workspace.
 *
 * The messages are built here rather than in the component so the numbers in them (file size, quota)
 * are testable without rendering Studio.
 */

/** pdf.js opens a locked document by throwing a `PasswordException`; nothing else in the import path uses that name. */
export function isPasswordProtectedPdfError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const named = error as { name?: unknown; code?: unknown };
  if (named.name === 'PasswordException') {
    return true;
  }
  // pdf.js also wraps worker failures as `UnknownErrorException` with the PasswordException code.
  return named.name === 'UnknownErrorException' && named.code === 1;
}

export const PASSWORD_PROTECTED_MESSAGE =
  'This PDF is password-protected, so it cannot be opened here. Save a copy without the password in your PDF reader, then add that copy.';

function formatMegabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

/**
 * Why the file will not fit the workspace, or `null` when it will. The VFS would refuse the write
 * anyway; the point is to say "this file is 535 MB" instead of "close some documents" on an empty
 * canvas.
 */
export function workspaceQuotaRefusal(params: {
  fileSize: number;
  usedBytes: number;
  limitBytes?: number;
}): string | null {
  const { fileSize, usedBytes, limitBytes } = params;
  if (limitBytes === undefined || !Number.isFinite(limitBytes)) {
    return null;
  }
  if (fileSize <= limitBytes - usedBytes) {
    return null;
  }
  const used = usedBytes > 0 ? `, ${formatMegabytes(usedBytes)} already in use` : '';
  return `This file is ${formatMegabytes(fileSize)} — larger than the workspace can hold (${formatMegabytes(limitBytes)} total${used}). Try a smaller file.`;
}
