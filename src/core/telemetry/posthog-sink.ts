import type { RunnerTelemetryEvent } from '../types/contracts';
import type { TelemetrySink } from '../telemetry/telemetry';

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
    };
    gtag?: (command: string, action: string, params?: Record<string, unknown>) => void;
  }
}

/**
 * PostHogTelemetrySink forwards relevant runner telemetry events to PostHog and GA4.
 */
export class PostHogTelemetrySink implements TelemetrySink {
  track(event: RunnerTelemetryEvent): void {
    if (typeof window === 'undefined') return;

    // GA4 Tracking for major lifecycle events
    if (event.type === 'TOOL_RUN_STARTED') {
      this.trackGA4('tool_start', {
        tool_id: event.toolId,
        input_count: event.inputCount,
        total_input_size: event.totalInputSize,
      });
    } else if (event.type === 'TOOL_RUN_RESULT') {
      this.trackGA4('tool_success', {
        tool_id: event.toolId,
        duration_ms: event.durationMs,
        output_count: event.outputCount,
        total_input_size: event.totalInputSize,
      });
    } else if (event.type === 'TOOL_RUN_ERROR') {
      this.trackGA4('tool_error', {
        tool_id: event.toolId,
        error_code: event.code,
      });
    }

    // PostHog Tracking for detailed action data
    if (window.posthog) {
      switch (event.type) {
        case 'APP_SESSION_ATTRIBUTED':
          window.posthog.capture('app_session_attributed', {
            flow_id: event.flowId,
            entry_url: event.entryUrl,
            entry_path: event.entryPath,
            referrer: event.referrer,
            referring_domain: event.referringDomain,
            utm_source: event.utmSource,
            utm_medium: event.utmMedium,
            utm_campaign: event.utmCampaign,
          });
          break;
        case 'APP_FILE_UPLOADED':
          window.posthog.capture('app_file_uploaded', {
            flow_id: event.flowId,
            tool_id: event.toolId,
            file_count: event.fileCount,
            mime_category: event.mimeCategory,
            total_bytes: event.totalBytes,
            source: event.source,
          });
          break;
        case 'OUTPUT_DOWNLOADED':
          window.posthog.capture('app_output_downloaded', {
            flow_id: event.flowId,
            run_id: event.runId,
            tool_id: event.toolId,
            output_count: event.outputCount,
            surface: event.surface,
          });
          break;
        case 'TOOL_RUN_ABANDONED':
          window.posthog.capture('app_tool_run_abandoned', {
            flow_id: event.flowId,
            run_id: event.runId,
            tool_id: event.toolId,
            reason: event.reason,
          });
          break;
        case 'TOOL_RUN_STARTED':
          window.posthog.capture('app_tool_run_started', {
            tool_id: event.toolId,
            input_count: event.inputCount,
            total_input_size: event.totalInputSize,
          });
          break;
        case 'TOOL_RUN_RESULT':
          window.posthog.capture('app_tool_run_success', {
            tool_id: event.toolId,
            duration_ms: event.durationMs,
            output_count: event.outputCount,
            total_input_size: event.totalInputSize,
          });
          break;
        case 'TOOL_RUN_ERROR':
          window.posthog.capture('app_tool_run_error', {
            tool_id: event.toolId,
            error_code: event.code,
            message: event.message,
          });
          break;
        case 'UI_UPSELL_SHOWN':
          window.posthog.capture('app_upsell_shown', {
            tool_id: event.toolId,
            reason: event.reason,
          });
          break;
        case 'STUDIO_EDIT_SAVE_ACTION':
          window.posthog.capture('app_studio_save', {
            tool_id: event.toolId,
            action: event.action,
            pages_total: event.pagesTotal,
            pages_succeeded: event.pagesSucceeded,
          });
          break;
      }
    }
  }

  private trackGA4(action: string, params: Record<string, unknown>): void {
    if (window.gtag) {
      window.gtag('event', action, params);
    }
  }
}
