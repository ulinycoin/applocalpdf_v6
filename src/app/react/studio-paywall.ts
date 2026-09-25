import type { TelemetrySink } from '../../core/public';
import { trackMonetizationEvent, trackPaywallShown } from './monetization-telemetry';
import { getTrialState, rescheduleTrialExpiryWatch } from '../platform/trial-manager';
import type { BillingService } from '../platform/billing-service';
import {
  checkDailyFileQuota,
  consumeDailyFileQuota,
  dailyFileQuotaMessage,
  type DailyFileQuotaKind,
} from '../platform/daily-file-quota';

export function showStudioPaywall(
  telemetry: TelemetrySink,
  reason: string,
  _billingUrl?: string,
  metadata: {
    toolId?: string;
    trigger?: string;
  } = {},
): string {
  const runId = crypto.randomUUID();
  const trialState = getTrialState();
  const toolId = metadata.toolId ?? 'studio';
  const trigger = metadata.trigger ?? 'upsell_guardrail';

  const displayReason = trialState.isActive
    ? `Trial: ${trialState.daysRemaining}d ${trialState.hoursRemaining}h remaining`
    : reason;

  telemetry.track({
    type: 'UI_UPSELL_SHOWN',
    runId,
    toolId,
    reason: displayReason,
  });

  trackPaywallShown({
    source: 'studio_paywall',
    toolId,
    trigger: trialState.isActive ? 'trial_countdown' : trigger,
    reason: displayReason,
    userState: 'local',
    hadPriorSuccessfulRun: false,
    flowId: runId,
  });

  return runId;
}

/**
 * LEGACY — the 3-day trial is retired (Sep 2026): it produced 0 purchases while absorbing 35 of 36
 * paywall CTA clicks, so it is no longer offered anywhere in the UI. Only users who already started
 * a trial keep their remaining days (see trial-manager). Do not wire new trial CTAs.
 */
export function activateProTrial(
  billing: BillingService,
  flowId: string,
  source = 'studio_paywall',
): void {
  if (!getTrialState().trialAvailable) {
    return;
  }
  billing.startTrial();
  trackMonetizationEvent('trial_started', {
    source,
    trigger: 'paywall_offer',
    flowId,
    userState: 'local',
  });
  rescheduleTrialExpiryWatch();
}

/**
 * Free plan: three files in and three files out per day. Returns false and shows the upgrade
 * paywall when the allowance is spent, so callers must not continue with the file operation.
 */
export function requestDailyFileAllowance(
  telemetry: TelemetrySink,
  plan: string,
  kind: DailyFileQuotaKind,
  count = 1,
): boolean {
  if (plan !== 'basic') {
    return true;
  }

  const check = checkDailyFileQuota(kind, count);
  if (!check.allowed) {
    showStudioPaywall(
      telemetry,
      dailyFileQuotaMessage(kind, count),
      (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_BILLING_URL,
      {
        toolId: 'studio',
        trigger: kind === 'processed' ? 'daily_files_processed' : 'daily_files_downloaded',
      },
    );
    return false;
  }

  consumeDailyFileQuota(kind, count);
  return true;
}

/** Same check without consuming, for flows that must count exactly what succeeded. */
export function canAcceptDailyFiles(
  telemetry: TelemetrySink,
  plan: string,
  count = 1,
): boolean {
  if (plan !== 'basic') {
    return true;
  }

  if (checkDailyFileQuota('processed', count).allowed) {
    return true;
  }

  showStudioPaywall(
    telemetry,
    dailyFileQuotaMessage('processed', count),
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_BILLING_URL,
    { toolId: 'studio', trigger: 'daily_files_processed' },
  );
  return false;
}

export function recordAcceptedFiles(count = 1): void {
  consumeDailyFileQuota('processed', count);
}
