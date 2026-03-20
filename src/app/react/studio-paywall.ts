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

  if (typeof window !== 'undefined') {
    const shouldOpenPricing = window.confirm(`${reason}\n\nOpen pricing now?`);
    if (shouldOpenPricing) {
      telemetry.track({
        type: 'UI_UPSELL_CTA_CLICKED',
        runId,
        toolId: 'studio',
        reason,
      });
      openBillingPlans(billingUrl);
    }
  }

  return runId;
}
