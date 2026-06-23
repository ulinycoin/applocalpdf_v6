import { QpdfPipelineError } from './qpdf-errors';
import {
  PROTECT_ALREADY_ENCRYPTED_MESSAGE,
  isEncryptedPdfLoadMessage,
} from '../../../shared/protect-errors';

export { PROTECT_ALREADY_ENCRYPTED_MESSAGE, PROTECT_INPUT_ALREADY_ENCRYPTED_CODE } from '../../../shared/protect-errors';

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
