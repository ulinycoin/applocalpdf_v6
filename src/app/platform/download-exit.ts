/**
 * Cross-surface contract for "a file the user gets to keep".
 *
 * Every exit point in the product used to report differently: Studio gated and emitted, the wizard did
 * neither, the redaction certificate emitted a one-off event, and share-to-phone was counted as a
 * download. That made `app_output_downloaded` unusable as a funnel denominator. This module is the one
 * place that decides whether an exit is allowed and the one place that reports it.
 *
 * Unit of the daily quota, and therefore of the metric: **one file handed to the user**.
 * `attempted` = calls to `clearDownloadAllowance`, `succeeded` = files actually delivered
 * (`outputCount`), `denied` = attempts the quota refused. A batch that asks for more files than the
 * allowance covers is refused as a whole and delivers nothing, so a partial download never happens.
 */
import type { TelemetrySink } from '../../core/public';
import { checkDailyFileQuota, refundDailyFileQuota } from './daily-file-quota';
import { requestDailyDownloadAllowance } from '../react/studio-paywall';
import { getOrCreateFlowId } from './browser-context';

export type DownloadSurface = 'wizard' | 'studio';

export interface DownloadExitContext {
  telemetry: TelemetrySink;
  plan: string;
  surface: DownloadSurface;
  toolId: string;
  runId?: string;
}

export type DownloadOutcome = 'success' | 'failure';

/** Stable, low-cardinality error code for the failure outcome: the error class, never the message. */
export function downloadErrorCode(reason: unknown): string {
  return reason instanceof Error && reason.name ? reason.name : 'download_failed';
}

function downloadEventBase(context: DownloadExitContext) {
  return {
    type: 'OUTPUT_DOWNLOADED' as const,
    flowId: getOrCreateFlowId(),
    runId: context.runId,
    toolId: context.toolId,
    surface: context.surface,
  };
}

/**
 * Ask the daily quota for `requested` files and report the attempt either way.
 *
 * Returns true only when the caller may proceed: the allowance is consumed at that moment, so callers
 * that then fail must report the failure with `recordDownloadOutcome` and decide whether to refund the
 * quota (`refundDownloadAllowance`) — an aborted download that still burns the daily allowance is worse
 * than no gate at all.
 */
export function clearDownloadAllowance(
  context: DownloadExitContext,
  requested = 1,
  onDenied?: () => void,
): boolean {
  if (context.plan !== 'basic') {
    return true;
  }

  const check = checkDailyFileQuota(requested);
  // `requestDailyDownloadAllowance` shows the paywall (monetization funnel) and calls the same
  // `checkDailyFileQuota`, so it cannot disagree with the numbers reported here.
  const allowed = requestDailyDownloadAllowance(context.telemetry, context.plan, requested);
  if (!allowed) {
    context.telemetry.track({
      ...downloadEventBase(context),
      outcome: 'denied',
      requested,
      reason: 'daily_download_limit',
      remaining: check.remaining,
    });
    onDenied?.();
    return false;
  }

  return true;
}

/** Report what actually left the app. `delivered` is what the caller really handed over. */
export function recordDownloadOutcome(
  context: DownloadExitContext,
  outcome: DownloadOutcome,
  requested: number,
  delivered: number,
  errorCode?: string,
): void {
  context.telemetry.track({
    ...downloadEventBase(context),
    outcome,
    requested,
    outputCount: delivered,
    errorCode,
  });
}

/** Give back the allowance consumed by an attempt that delivered fewer files than it asked for. */
export function refundDownloadAllowance(requested: number, delivered: number): void {
  if (delivered >= requested) {
    return;
  }
  refundDailyFileQuota(requested - delivered);
}
