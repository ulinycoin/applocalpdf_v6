import type { TelemetrySink } from '../../core/public';
import { trackMonetizationEvent } from './monetization-telemetry';
import { getTrialState, startTrial } from '../platform/trial-manager';

export function showStudioPaywall(
  telemetry: TelemetrySink,
  reason: string,
  _billingUrl?: string,
): string {
  const runId = crypto.randomUUID();
  const trialState = getTrialState();

  const displayReason = trialState.isActive
    ? `Trial: ${trialState.daysRemaining}d ${trialState.hoursRemaining}h remaining`
    : reason;

  telemetry.track({
    type: 'UI_UPSELL_SHOWN',
    runId,
    toolId: 'studio',
    reason: displayReason,
  });

  trackMonetizationEvent('paywall_shown', {
    source: 'studio_paywall',
    toolId: 'studio',
    trigger: trialState.isActive ? 'trial_countdown' : 'upsell_guardrail',
    reason: displayReason,
    userState: 'local',
    hadPriorSuccessfulRun: false,
    flowId: runId,
  });

  return runId;
}

export function handleTrialStart(telemetry: TelemetrySink, flowId: string): void {
  startTrial();

  trackMonetizationEvent('trial_started', {
    source: 'studio_paywall',
    trigger: 'paywall_offer',
    flowId,
    userState: 'local',
  });
}
