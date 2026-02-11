import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { usePlatform } from './platform-context';
import { WizardShell as V6WizardShell } from '../../v6/components/Wizard/WizardShell';
import { StudioShell } from '../../v6/components/Studio/StudioShell';

function LoadingScreen() {
  return <div>Loading tool...</div>;
}

function EmptyToolsState() {
  return <div>No tools are registered.</div>;
}

export function ToolRoutes() {
  const { routes } = usePlatform();

  if (routes.length === 0) {
    return <EmptyToolsState />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {routes.map((toolRoute) => {
          return (
            <Route
              key={toolRoute.toolId}
              path={toolRoute.path}
              element={<V6WizardShell toolId={toolRoute.toolId} />}
            />
          );
        })}
        <Route path="/studio" element={<StudioShell />} />
        <Route path="*" element={<Navigate to={routes[0].path} replace />} />
      </Routes>
    </Suspense>
  );
}
