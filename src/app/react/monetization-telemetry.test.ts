import assert from 'node:assert/strict';
import test from 'node:test';
import { trackMonetizationEvent, trackPaywallShown } from './monetization-telemetry';

interface Capture {
  event: string;
  properties?: Record<string, unknown>;
}

function installWindow(captures: Capture[]): () => void {
  const globalWindow = globalThis as any;
  const original = globalWindow.window;
  const session = new Map<string, string>();
  globalWindow.window = {
    location: { pathname: '/app/studio' },
    posthog: {
      capture: (event: string, properties?: Record<string, unknown>) => {
        captures.push({ event, properties });
      },
    },
    sessionStorage: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => { session.set(key, value); },
      removeItem: (key: string) => { session.delete(key); },
    },
  };
  return () => {
    if (original === undefined) delete globalWindow.window;
    else globalWindow.window = original;
  };
}

test('the post-export offer reports paywall_shown under its own source, exactly once per session', () => {
  const captures: Capture[] = [];
  const restore = installWindow(captures);

  try {
    const props = {
      source: 'studio_export_moment',
      toolId: 'studio',
      trigger: 'export_success',
      reason: 'multi_document_workspace',
      userState: 'local' as const,
      hadPriorSuccessfulRun: true,
    };

    // `trackPaywallShown` is what the offer calls; it carries the session guard, and the guard must key
    // on this trigger so a second export does not add a second qualified impression.
    assert.equal(trackPaywallShown(props), true);
    assert.equal(trackPaywallShown(props), false);

    assert.equal(captures.length, 1);
    assert.equal(captures[0].event, 'paywall_shown');
    assert.equal(captures[0].properties?.source, 'studio_export_moment');
    assert.equal(captures[0].properties?.trigger, 'export_success');
    assert.equal(captures[0].properties?.reason, 'multi_document_workspace');
    // The route is attached automatically, which is what makes the funnel readable per surface.
    assert.equal(captures[0].properties?.route, '/app/studio');
  } finally {
    restore();
  }
});

test('a dismissal is reported separately from the impression', () => {
  const captures: Capture[] = [];
  const restore = installWindow(captures);

  try {
    trackMonetizationEvent('paywall_dismissed', {
      source: 'studio_export_moment',
      toolId: 'studio',
      trigger: 'export_success',
    });

    assert.equal(captures.length, 1);
    assert.equal(captures[0].event, 'paywall_dismissed');
    assert.equal(captures[0].properties?.source, 'studio_export_moment');
  } finally {
    restore();
  }
});
