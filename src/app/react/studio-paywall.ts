import type { TelemetrySink } from '../../core/telemetry/telemetry';

export function showStudioPaywall(telemetry: TelemetrySink, reason: string): string {
  const runId = crypto.randomUUID();
  telemetry.track({
    type: 'UI_UPSELL_SHOWN',
    runId,
    toolId: 'studio',
    reason,
  });
  return runId;
}
