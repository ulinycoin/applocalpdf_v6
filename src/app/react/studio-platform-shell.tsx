import { useState, useEffect } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { PlatformProvider } from './platform-context';
import { ToolRoutes } from './tool-routes';
import { UxFeedbackOverlay } from './ux-feedback-overlay';
import { TelemetryPanel } from './telemetry-panel';
import { StudioTopNav } from './studio-top-nav';
import { APP_BASE_PATH } from '../../../shared/app-routes';

/**
 * SPA pageview tracker.
 * PostHog `capture_pageview` only fires on full page loads; React Router navigation
 * changes the URL without reloading, so those pageviews were silently dropped.
 * This fires $pageview on mount AND on every pathname/search change so the
 * entry → studio funnel is measured truthfully. `$pathname`/`$current_url` are
 * auto-populated by PostHog from the current URL, keeping data consistent with
 * full-load pageviews.
 */
function PageViewTracker() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (window.posthog) {
      window.posthog.capture('$pageview');
    }
  }, [pathname, search]);

  return null;
}

export function StudioPlatformShell() {
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const telemetryEnabled = import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === '1';

  return (
    <BrowserRouter basename={APP_BASE_PATH} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PageViewTracker />
      <PlatformProvider>
        <UxFeedbackOverlay />
        <div className="studio-app-layout">
          <StudioTopNav
            telemetryEnabled={telemetryEnabled}
            telemetryOpen={telemetryOpen}
            onToggleTelemetry={() => setTelemetryOpen((value) => !value)}
          />
          {telemetryEnabled && telemetryOpen && (
            <section className="studio-telemetry-panel" aria-label="Telemetry panel">
              <TelemetryPanel />
            </section>
          )}
          <main className="studio-main-shell">
            <ToolRoutes />
          </main>
        </div>
      </PlatformProvider>
    </BrowserRouter>
  );
}
