import type { TelemetrySink } from '../../core/public';
import { trackMonetizationEvent, trackPaywallShown } from './monetization-telemetry';
import { getTrialState, rescheduleTrialExpiryWatch } from '../platform/trial-manager';
import type { BillingService } from '../platform/billing-service';

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
