import { QueryClient } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { createAppRouter } from './router';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('No se encontró #root');

createRoot(rootElement).render(
  <StrictMode>
    <App router={createAppRouter()} queryClient={new QueryClient()} />
  </StrictMode>,
);
