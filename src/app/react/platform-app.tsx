import { BrowserRouter } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { PlatformProvider } from './platform-context';
import { TelemetryPanel } from './telemetry-panel';
import { ToolRoutes } from './tool-routes';
import { ToolSidebar } from './tool-sidebar';
import { UxFeedbackOverlay } from './ux-feedback-overlay';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'localpdf.sidebar.collapsed';

export function PlatformApp() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PlatformProvider>
        <UxFeedbackOverlay />
        <div className={`app-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
          <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
            <ToolSidebar collapsed={isSidebarCollapsed} onToggleCollapsed={() => setIsSidebarCollapsed((current) => !current)} />
            <TelemetryPanel />
          </aside>
          <main className="main-shell">
            <ToolRoutes />
          </main>
        </div>
      </PlatformProvider>
    </BrowserRouter>
  );
}
