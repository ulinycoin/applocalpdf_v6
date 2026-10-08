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
 *
 * Declared runner events that are deliberately NOT forwarded here (do not "fix" this list):
 * - TOOL_RUN_PROGRESS, ACCESS_CHECK_STAGE, PAGE_COUNT_WORKER_STAGE: per-run plumbing, high volume.
 * - UI_TOAST_DEDUPED, UI_PREVIEW_RENDERED: dedupe/render bookkeeping, no product signal.
 * - UI_UPSELL_CTA_CLICKED: already captured as `paywall_cta_clicked` by the monetization telemetry
 *   (`src/app/react/monetization-telemetry.ts`); mapping it here would double-count the funnel.
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
            surface: event.surface,
            outcome: event.outcome,
            output_count: event.outputCount,
            requested: event.requested,
            error_code: event.errorCode,
            reason: event.reason,
            remaining: event.remaining,
            unit: 'file',
          });
          break;
        case 'SHARED_FILE_SAVED':
          window.posthog.capture('app_shared_file_saved', {
            flow_id: event.flowId,
            tool_id: event.toolId,
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
        case 'STUDIO_EDIT_TOOL_SELECTED':
          window.posthog.capture('studio_edit_tool_selected', {
            run_id: event.runId,
            tool_id: event.toolId,
            tool: event.tool,
            method: event.method,
          });
          break;
        case 'STUDIO_EDIT_FLOATING_MENU_ACTION':
          window.posthog.capture('studio_edit_element_action', {
            run_id: event.runId,
            tool_id: event.toolId,
            action: event.action,
            change_type: event.changeType,
          });
          break;
        case 'STUDIO_EDIT_ZOOM_CHANGED':
          window.posthog.capture('studio_edit_zoom_changed', {
            run_id: event.runId,
            tool_id: event.toolId,
            source: event.source,
            preset: event.preset,
            scale_level: event.scaleLevel,
          });
          break;
        case 'STUDIO_EDIT_GUARDRAIL':
          window.posthog.capture('studio_edit_guardrail', {
            run_id: event.runId,
            tool_id: event.toolId,
            code: event.code,
            message: event.message,
          });
          break;
        case 'STUDIO_TEXT_EDIT_STARTED':
          window.posthog.capture('studio_text_edit_started', {
            run_id: event.runId,
            tool_id: event.toolId,
            file_id: event.fileId,
            page_index: event.pageIndex,
            mode: event.mode,
          });
          break;
        case 'STUDIO_TEXT_EDIT_COMMITTED':
          window.posthog.capture('studio_text_edit_committed', {
            run_id: event.runId,
            tool_id: event.toolId,
            file_id: event.fileId,
            page_index: event.pageIndex,
            mode: event.mode,
            changed: event.changed,
            chars_before: event.charsBefore,
            chars_after: event.charsAfter,
            chars_delta: event.charsDelta,
            lines: event.lines,
            multiline: event.multiline,
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
        case 'STUDIO_EMPTY_STATE_CTA':
          window.posthog.capture('studio_empty_state_cta', {
            run_id: event.runId,
            action: event.action,
          });
          break;
        case 'STUDIO_MERGE_COMPLETED':
          window.posthog.capture('studio_merge_completed', {
            run_id: event.runId,
            source_doc_id: event.sourceDocId,
            target_doc_id: event.targetDocId,
            page_count: event.pageCount,
            method: event.method,
          });
          break;
        case 'STUDIO_SPLIT_COMPLETED':
          window.posthog.capture('studio_split_completed', {
            run_id: event.runId,
            source_doc_id: event.sourceDocId,
            new_doc_id: event.newDocId,
            page_count: event.pageCount,
            method: event.method,
          });
          break;
        case 'STUDIO_DELETE_PAGES':
          window.posthog.capture('studio_delete_pages', {
            run_id: event.runId,
            page_count: event.pageCount,
            workspace_count: event.workspaceCount,
            method: event.method,
          });
          break;
        case 'TOOL_RUN_DENIED':
          window.posthog.capture('app_tool_run_denied', {
            run_id: event.runId,
            tool_id: event.toolId,
            reason: event.reason,
          });
          break;
        case 'PAGE_COUNT_CHECK_ERROR':
          window.posthog.capture('app_page_count_check_error', {
            run_id: event.runId,
            tool_id: event.toolId,
            code: event.code,
            message: event.message,
            duration_ms: event.durationMs,
          });
          break;
        case 'UI_PREVIEW_ERROR':
          window.posthog.capture('app_ui_preview_error', {
            run_id: event.runId,
            tool_id: event.toolId,
            message: event.message,
          });
          break;
        case 'UI_TOAST_SHOWN':
          // Only failures: info toasts are expected UX, and forwarding every one would drown the funnel.
          if (event.level === 'error') {
            window.posthog.capture('app_ui_error_toast', {
              tool_id: event.toolId,
              message: event.message,
            });
          }
          break;
        case 'REDACT_VERIFY_RUN':
          window.posthog.capture('app_redact_verify_run', {
            run_id: event.runId,
            tool_id: event.toolId,
            passed: event.passed,
            check_count: event.checkCount,
            fail_count: event.failCount,
          });
          break;
        case 'REDACT_VERIFY_FAIL':
          window.posthog.capture('app_redact_verify_fail', {
            run_id: event.runId,
            tool_id: event.toolId,
            check_id: event.checkId,
            message: event.message,
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
