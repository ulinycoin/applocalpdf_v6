import type { TelemetrySink } from '../../core/public';

export type StudioRedactCheckResult = 'pass' | 'fail' | 'skip' | 'error';

export interface StudioRedactCheckItem {
  id: string;
  result: StudioRedactCheckResult;
  label: string;
}

export interface StudioRedactVerifyState {
  runId: string;
  passed: boolean;
  checks: StudioRedactCheckItem[];
  certificateJson?: string;
  updatedAt: number;
}

const CHECK_LABELS: Record<string, string> = {
  text_extract: 'Text extract',
  metadata_xmp: 'Metadata / XMP',
  annotations: 'Annotations',
  raw_bytes: 'Raw bytes',
  error: 'Verify engine',
};

function normalizeCheckResult(raw: string): StudioRedactCheckResult {
  if (raw === 'pass' || raw === 'fail' || raw === 'skip' || raw === 'error') {
    return raw;
  }
  return 'error';
}

export function parseWorkerRedactVerify(
  payload: {
    passed: boolean;
    checks: string[];
    certificateJson?: string;
  },
  runId: string,
): StudioRedactVerifyState {
  const checks = payload.checks.map((entry) => {
    const separator = entry.indexOf(':');
    const id = separator >= 0 ? entry.slice(0, separator) : entry;
    const resultRaw = separator >= 0 ? entry.slice(separator + 1) : 'error';
    return {
      id,
      result: normalizeCheckResult(resultRaw),
      label: CHECK_LABELS[id] ?? id,
    };
  });

  return {
    runId,
    passed: payload.passed,
    checks,
    certificateJson: payload.certificateJson,
    updatedAt: Date.now(),
  };
}

export function trackRedactVerifyTelemetry(
  telemetry: TelemetrySink,
  state: StudioRedactVerifyState,
  toolId = 'studio.edit.redact',
): void {
  const failCount = state.checks.filter((check) => check.result === 'fail' || check.result === 'error').length;
  telemetry.track({
    type: 'REDACT_VERIFY_RUN',
    runId: state.runId,
    toolId,
    passed: state.passed,
    checkCount: state.checks.length,
    failCount,
  });

  for (const check of state.checks) {
    if (check.result === 'fail' || check.result === 'error') {
      telemetry.track({
        type: 'REDACT_VERIFY_FAIL',
        runId: state.runId,
        toolId,
        checkId: check.id,
        message: `${check.label}: ${check.result}`,
      });
    }
  }
}

export function downloadCertificateJson(certificateJson: string, baseFileName: string): void {
  const safeBase = baseFileName.replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*]/g, '_').slice(0, 64) || 'document';
  const blob = new Blob([certificateJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeBase}-localpdf-certificate.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function mergeRedactVerifyStates(
  current: StudioRedactVerifyState | null,
  next: StudioRedactVerifyState,
): StudioRedactVerifyState {
  if (!current) {
    return next;
  }
  if (!next.passed) {
    return next;
  }
  if (!current.passed) {
    return current;
  }
  return next.updatedAt >= current.updatedAt ? next : current;
}
