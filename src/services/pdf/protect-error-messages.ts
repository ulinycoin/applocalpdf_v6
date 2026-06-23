import { QpdfPipelineError } from './qpdf-errors';

export const PROTECT_ALREADY_ENCRYPTED_MESSAGE =
  'This PDF is already password-protected. Use Unlock PDF first, then apply new protection.';

export function isEncryptedPdfLoadMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('encrypted') || normalized.includes('decrypt');
}

export function toProtectInputError(error: unknown): Error {
  if (error instanceof QpdfPipelineError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  if (isEncryptedPdfLoadMessage(message)) {
    return new QpdfPipelineError('PROTECT_INPUT_ALREADY_ENCRYPTED', PROTECT_ALREADY_ENCRYPTED_MESSAGE);
  }

  return error instanceof Error ? error : new Error(message || 'Protect PDF failed');
}
