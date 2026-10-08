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
      surface: 'studio',
      outcome: 'success',
      requested: 1,
      outputCount: 1,
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
          surface: 'studio',
          outcome: 'success',
          output_count: 1,
          requested: 1,
          error_code: undefined,
          reason: undefined,
          remaining: undefined,
          unit: 'file',
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

test('PostHogTelemetrySink forwards denials, page-count failures and redaction trust events', () => {
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

    sink.track({ type: 'TOOL_RUN_DENIED', runId: 'run-1', toolId: 'ocr-pdf', reason: 'LIMIT_EXCEEDED' });
    sink.track({
      type: 'PAGE_COUNT_CHECK_ERROR',
      runId: 'run-1',
      toolId: 'ocr-pdf',
      fileId: 'file-1',
      code: 'PAGE_COUNT_TIMEOUT',
      message: 'Page count timed out',
      durationMs: 12000,
    });
    sink.track({
      type: 'UI_PREVIEW_ERROR',
      runId: 'run-2',
      toolId: 'studio',
      fileId: 'file-1',
      message: 'Invalid PDF structure',
    });
    sink.track({ type: 'UI_TOAST_SHOWN', runId: 'run-2', toolId: 'studio', message: 'Broken file', level: 'error' });
    sink.track({ type: 'UI_TOAST_SHOWN', runId: 'run-2', toolId: 'studio', message: 'Saved', level: 'info' });
    sink.track({ type: 'REDACT_VERIFY_RUN', runId: 'run-3', toolId: 'studio.edit.redact', passed: false, checkCount: 4, failCount: 1 });
    sink.track({
      type: 'REDACT_VERIFY_FAIL',
      runId: 'run-3',
      toolId: 'studio.edit.redact',
      checkId: 'text_extract',
      message: 'Text extraction: fail',
    });

    assert.deepEqual(calls, [
      { event: 'app_tool_run_denied', properties: { run_id: 'run-1', tool_id: 'ocr-pdf', reason: 'LIMIT_EXCEEDED' } },
      {
        event: 'app_page_count_check_error',
        properties: {
          run_id: 'run-1',
          tool_id: 'ocr-pdf',
          code: 'PAGE_COUNT_TIMEOUT',
          message: 'Page count timed out',
          duration_ms: 12000,
        },
      },
      { event: 'app_ui_preview_error', properties: { run_id: 'run-2', tool_id: 'studio', message: 'Invalid PDF structure' } },
      { event: 'app_ui_error_toast', properties: { tool_id: 'studio', message: 'Broken file' } },
      {
        event: 'app_redact_verify_run',
        properties: { run_id: 'run-3', tool_id: 'studio.edit.redact', passed: false, check_count: 4, fail_count: 1 },
      },
      {
        event: 'app_redact_verify_fail',
        properties: { run_id: 'run-3', tool_id: 'studio.edit.redact', check_id: 'text_extract', message: 'Text extraction: fail' },
      },
    ]);
  } finally {
    globalWindow.window = originalWindow;
  }
});

test('PostHogTelemetrySink sends text editing telemetry without any document text', () => {
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
      type: 'STUDIO_TEXT_EDIT_STARTED',
      runId: 'run-1',
      toolId: 'studio.edit.text',
      fileId: 'file-1',
      pageIndex: 2,
      mode: 'existing-line',
    });
    sink.track({
      type: 'STUDIO_TEXT_EDIT_COMMITTED',
      runId: 'run-1',
      toolId: 'studio.edit.text',
      fileId: 'file-1',
      pageIndex: 2,
      mode: 'existing-line',
      changed: true,
      charsBefore: 10,
      charsAfter: 14,
      charsDelta: 4,
      lines: 1,
      multiline: false,
    });
    sink.track({
      type: 'STUDIO_EDIT_FLOATING_MENU_ACTION',
      runId: 'run-1',
      toolId: 'studio.edit',
      action: 'update',
      changeType: 'fontSize',
    });

    assert.equal(calls[0]?.event, 'studio_text_edit_started');
    assert.equal(calls[0]?.properties?.mode, 'existing-line');
    assert.equal(calls[0]?.properties?.page_index, 2);

    assert.equal(calls[1]?.event, 'studio_text_edit_committed');
    assert.equal(calls[1]?.properties?.chars_delta, 4);
    assert.equal(calls[1]?.properties?.changed, true);

    assert.equal(calls[2]?.event, 'studio_edit_element_action');
    assert.equal(calls[2]?.properties?.change_type, 'fontSize');

    // Nothing that could carry user content may leave the browser.
    const serialized = JSON.stringify(calls);
    assert.equal(/text"\s*:/.test(serialized), false, `unexpected text field: ${serialized}`);
  } finally {
    globalWindow.window = originalWindow;
  }
});

test('PostHogTelemetrySink reports a refused download with the outcome fields the funnel needs', () => {
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
      type: 'OUTPUT_DOWNLOADED',
      flowId: 'flow-1',
      runId: 'run-1',
      toolId: 'merge-pdf',
      surface: 'wizard',
      outcome: 'denied',
      requested: 2,
      reason: 'daily_download_limit',
      remaining: 0,
    });
    sink.track({ type: 'SHARED_FILE_SAVED', flowId: 'flow-1', toolId: 'share-pdf', surface: 'share_receive' });

    assert.deepEqual(calls, [
      {
        event: 'app_output_downloaded',
        properties: {
          flow_id: 'flow-1',
          run_id: 'run-1',
          tool_id: 'merge-pdf',
          surface: 'wizard',
          outcome: 'denied',
          output_count: undefined,
          requested: 2,
          error_code: undefined,
          reason: 'daily_download_limit',
          remaining: 0,
          unit: 'file',
        },
      },
      // A file someone sent you is measured on its own name and never counted as a download.
      {
        event: 'app_shared_file_saved',
        properties: { flow_id: 'flow-1', tool_id: 'share-pdf', surface: 'share_receive' },
      },
    ]);
  } finally {
    globalWindow.window = originalWindow;
  }
});
