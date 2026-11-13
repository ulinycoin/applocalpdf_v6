import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { inject } from '@vercel/analytics';
import { PlatformApp } from './app';
import { installChunkReload } from './app/platform/chunk-reload';
import { installByteArrayToHex } from './v6/services/pdf/pdfjs-compat';
import './styles.css';

// Initialize Vercel Analytics
inject();

// A deploy replaces every hashed chunk; an open tab that lazy-loads a feature afterwards would
// otherwise stay broken with "Failed to fetch dynamically imported module".
installChunkReload();

// pdf.js fingerprints documents with `Uint8Array.prototype.toHex`; without it, opening a file dies
// on a minified "a.toHex is not a function" before the first page renders.
installByteArrayToHex();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <PlatformApp />
  </StrictMode>,
);
