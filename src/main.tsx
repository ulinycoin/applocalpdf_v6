import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { inject } from '@vercel/analytics';
import { PlatformApp } from './app';
import './styles.css';

// Initialize Vercel Analytics
inject();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <PlatformApp />
  </StrictMode>,
);
