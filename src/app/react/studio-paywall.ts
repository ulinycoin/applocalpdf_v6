import type { TelemetrySink } from '../../core/telemetry/telemetry';
import { openBillingPlans } from './billing';

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



  return runId;
}
