import type { TelemetrySink } from '../../core/public';
import { trackMonetizationEvent } from './monetization-telemetry';

export function showStudioPaywall(
  telemetry: TelemetrySink,
  reason: string,
  billingUrl?: string,
): string {
  const runId = crypto.randomUUID();
  telemetry.track({
    type: 'UI_UPSELL_SHOWN',
    runId,
    toolId: 'studio',
    reason,
  });

  trackMonetizationEvent('paywall_shown', {
    source: 'studio_paywall',
    toolId: 'studio',
    trigger: 'upsell_guardrail',
    reason,
    userState: 'local',
    hadPriorSuccessfulRun: false,
    flowId: runId,
  });

  return runId;
}
