import assert from 'node:assert/strict';
import test from 'node:test';
import { PostHogTelemetrySink } from './posthog-sink';

test('PostHogTelemetrySink forwards app analytics events to PostHog', () => {
  const calls: Array<{ event: string; properties?: Record<string, unknown> }> = [];
  const globalWindow = globalThis as any;
  const originalWindow = globalWindow.window;

  globalWindow.window = {
    posthog: {
      capture: (event: string, properties?: Record<string, unknown>) => {
        calls.push({ event, properties });
      },
    },
  };

  try {
    const sink = new PostHogTelemetrySink();

    sink.track({
      type: 'APP_SESSION_ATTRIBUTED',
      flowId: 'flow-1',
      entryUrl: 'https://localpdf.online/app/studio',
      entryPath: '/app/studio',
      referrer: '$direct',
      referringDomain: '$direct',
      utmSource: 'newsletter',
      utmMedium: 'email',
      utmCampaign: 'spring',
    });

    sink.track({
      type: 'APP_FILE_UPLOADED',
      flowId: 'flow-1',
      toolId: 'merge-pdf',
      fileCount: 2,
      mimeCategory: 'pdf',
      totalBytes: 1024,
      source: 'studio',
    });

    sink.track({
      type: 'OUTPUT_DOWNLOADED',
      flowId: 'flow-1',
      runId: 'run-1',
      toolId: 'merge-pdf',
      outputCount: 1,
      surface: 'studio',
    });

    sink.track({
      type: 'TOOL_RUN_ABANDONED',
      flowId: 'flow-1',
      runId: 'run-1',
      toolId: 'merge-pdf',
      reason: 'cancel',
    });

    assert.deepEqual(calls, [
      {
        event: 'app_session_attributed',
        properties: {
          flow_id: 'flow-1',
          entry_url: 'https://localpdf.online/app/studio',
          entry_path: '/app/studio',
          referrer: '$direct',
          referring_domain: '$direct',
          utm_source: 'newsletter',
          utm_medium: 'email',
          utm_campaign: 'spring',
        },
      },
      {
        event: 'app_file_uploaded',
        properties: {
          flow_id: 'flow-1',
          tool_id: 'merge-pdf',
          file_count: 2,
          mime_category: 'pdf',
          total_bytes: 1024,
          source: 'studio',
        },
      },
      {
        event: 'app_output_downloaded',
        properties: {
          flow_id: 'flow-1',
          run_id: 'run-1',
          tool_id: 'merge-pdf',
          output_count: 1,
          surface: 'studio',
        },
      },
      {
        event: 'app_tool_run_abandoned',
        properties: {
          flow_id: 'flow-1',
          run_id: 'run-1',
          tool_id: 'merge-pdf',
          reason: 'cancel',
        },
      },
    ]);
  } finally {
    if (originalWindow === undefined) {
      delete globalWindow.window;
    } else {
      globalWindow.window = originalWindow;
    }
  }
});
