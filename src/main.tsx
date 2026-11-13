import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { inject } from '@vercel/analytics';
import { PlatformApp } from './app';
import { installChunkReload } from './app/platform/chunk-reload';
import './styles.css';

// Initialize Vercel Analytics
inject();

// A deploy replaces every hashed chunk; an open tab that lazy-loads a feature afterwards would
// otherwise stay broken with "Failed to fetch dynamically imported module".
installChunkReload();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <PlatformApp />
  </StrictMode>,
);
