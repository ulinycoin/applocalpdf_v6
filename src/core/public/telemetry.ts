export {
  TelemetryBus,
  CompositeTelemetrySink,
  ConsoleTelemetrySink,
  NoopTelemetrySink,
} from '../telemetry/telemetry';

export type { TelemetryListener, TelemetrySink } from '../telemetry/telemetry';

/**
 * Guarded PostHog send for UI code outside the sink. `window.posthog` is an array shim until the SDK
 * loads, so a direct `window.posthog.capture(...)` throws during bootstrap; this is the only supported
 * way to send from a component or plugin (`core/public` is the allowlisted UI→core boundary).
 */
export { posthogCapture } from '../telemetry/posthog-sink';
