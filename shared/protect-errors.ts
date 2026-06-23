export const PROTECT_INPUT_ALREADY_ENCRYPTED_CODE = 'PROTECT_INPUT_ALREADY_ENCRYPTED' as const;

export const PROTECT_ALREADY_ENCRYPTED_MESSAGE =
  'This PDF is already password-protected. Use Unlock PDF first, then apply new protection.';

export function isEncryptedPdfLoadMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('encrypted') || normalized.includes('decrypt');
}
