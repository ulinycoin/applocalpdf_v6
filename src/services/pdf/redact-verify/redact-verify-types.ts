export type RedactCheckId = 'text_extract' | 'metadata_xmp' | 'annotations' | 'raw_bytes';
export type RedactCheckResult = 'pass' | 'fail' | 'skip';

export interface RedactCheck {
  id: RedactCheckId;
  result: RedactCheckResult;
  message?: string;
}

export interface RedactVerifyResult {
  passed: boolean;
  checks: RedactCheck[];
  redactedStringHashes: string[];
  stats: {
    pages: number;
    redactionCount: number;
  };
}

export interface RedactCertificate {
  format: 'localpdf-certificate/v1';
  createdAt: string;
  tool: string;
  appVersion: string;
  inputSha256: string;
  outputSha256: string;
  redactedStringHashes: string[];
  checks: Record<RedactCheckId, RedactCheckResult>;
  stats: {
    pages: number;
    redactionCount: number;
  };
}

export function redactCheckResultToPassed(result: RedactCheckResult): boolean {
  return result === 'pass';
}
