import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { App } from './App';
import { createAppRouter } from './router';

describe('App', () => {
  it('renderiza la ruta de inicio', async () => {
    const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ['/'] }) });
    render(<App router={router} queryClient={new QueryClient()} />);
    expect(await screen.findByRole('heading', { name: 'ZESTIA DELIVERY' })).toBeInTheDocument();
  });
});
