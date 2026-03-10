import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { PlatformProvider } from './platform-context';
import { ToolRoutes } from './tool-routes';
import { UxFeedbackOverlay } from './ux-feedback-overlay';
import { TelemetryPanel } from './telemetry-panel';
import { StudioTopNav } from './studio-top-nav';

export function StudioPlatformShell() {
  const [telemetryOpen, setTelemetryOpen] = useState(false);

  return (
    <BrowserRouter basename="/app" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PlatformProvider>
        <UxFeedbackOverlay />
        <div className="studio-app-layout">
          <StudioTopNav telemetryOpen={telemetryOpen} onToggleTelemetry={() => setTelemetryOpen((value) => !value)} />
          {telemetryOpen && (
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
