import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource/barlow-semi-condensed/latin-500.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/barlow-semi-condensed/latin-700.css';
import './index.css';
import { createAppRouter } from './router';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('No se encontró #root');

createRoot(rootElement).render(
  <StrictMode>
    <App router={createAppRouter()} />
  </StrictMode>,
);
