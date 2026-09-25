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

    sink.track({
      type: 'UI_UPSELL_SHOWN',
      runId: 'run-upsell',
      toolId: 'studio',
      reason: 'Pro required',
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
      {
        event: 'app_upsell_shown',
        properties: {
          tool_id: 'studio',
          reason: 'Pro required',
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

test('PostHogTelemetrySink forwards studio page operations under their own event names', () => {
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
      type: 'STUDIO_MERGE_COMPLETED',
      runId: 'run-merge',
      sourceDocId: 'doc-a',
      targetDocId: 'doc-b',
      pageCount: 2,
      method: 'button',
    });
    sink.track({
      type: 'STUDIO_SPLIT_COMPLETED',
      runId: 'run-split',
      sourceDocId: 'doc-a',
      newDocId: 'doc-c',
      pageCount: 1,
      method: 'button',
    });
    sink.track({
      type: 'STUDIO_DELETE_PAGES',
      runId: 'run-delete',
      pageCount: 3,
      workspaceCount: 2,
      method: 'keyboard',
    });
    sink.track({
      type: 'STUDIO_EMPTY_STATE_CTA',
      runId: 'run-empty',
      action: 'upload',
    });

    assert.deepEqual(calls, [
      {
        event: 'studio_merge_completed',
        properties: {
          run_id: 'run-merge',
          source_doc_id: 'doc-a',
          target_doc_id: 'doc-b',
          page_count: 2,
          method: 'button',
        },
      },
      {
        event: 'studio_split_completed',
        properties: {
          run_id: 'run-split',
          source_doc_id: 'doc-a',
          new_doc_id: 'doc-c',
          page_count: 1,
          method: 'button',
        },
      },
      {
        event: 'studio_delete_pages',
        properties: {
          run_id: 'run-delete',
          page_count: 3,
          workspace_count: 2,
          method: 'keyboard',
        },
      },
      {
        event: 'studio_empty_state_cta',
        properties: {
          run_id: 'run-empty',
          action: 'upload',
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
